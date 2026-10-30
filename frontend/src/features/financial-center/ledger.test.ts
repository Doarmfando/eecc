import { describe, expect, it } from 'vitest';

import { statementFixture, transactionFixture } from '@/test/financial-fixtures';

import { buildLedger, consolidatedBalance, predatesYearFix } from './ledger';
import {
  computeSubtotals,
  computeTotals,
  filterLedgerRows,
  NO_FILTERS,
  rowsInScope,
  sortLedgerRows,
} from './ledger-filters';
import type { FinancialStatement, StatementAccount } from './types';
import { computeBankBalances } from './use-financial-center';

const CUENTA_A: StatementAccount = { clave: 'aaaaaaaa', terminacion: '1111' };
const CUENTA_B: StatementAccount = { clave: 'bbbbbbbb', terminacion: '2222' };

/** Un mes de una cuenta, con un abono y un cargo y su saldo impreso. Cifras inventadas. */
function month(
  id: string,
  fechaPeriodo: string,
  saldoInicial: number,
  overrides: Partial<FinancialStatement> = {},
): FinancialStatement {
  const abono = 50000;
  const cargo = 20000;
  return statementFixture({
    id,
    cuenta: CUENTA_A,
    fechaPeriodo,
    saldoInicial,
    abonos: abono,
    cargos: cargo,
    saldoFinal: saldoInicial + abono - cargo,
    movimientos: [
      transactionFixture({
        id: `${id}-0`,
        statementId: id,
        date: `${fechaPeriodo}-03`,
        description: 'YAPE recibido',
        type: 'ABONO',
        amountCents: abono,
        balanceCents: saldoInicial + abono,
        source: { page: 1, row: 1 },
      }),
      transactionFixture({
        id: `${id}-1`,
        statementId: id,
        date: `${fechaPeriodo}-20`,
        description: 'Pago SUNAT',
        type: 'CARGO',
        amountCents: cargo,
        balanceCents: saldoInicial + abono - cargo,
        source: { page: 1, row: 2 },
      }),
    ],
    ...overrides,
  });
}

describe('buildLedger: cuentas', () => {
  it('no mezcla dos cuentas del mismo banco', () => {
    const ledger = buildLedger([
      month('a-ene', '2026-01', 100000),
      month('b-ene', '2026-01', 500000, { cuenta: CUENTA_B }),
    ]);
    expect(ledger.accounts.map((account) => account.terminacion)).toEqual(['1111', '2222']);
    expect(ledger.issues.some((issue) => issue.kind === 'PERIODO_SUPERPUESTO')).toBe(false);
  });

  it('en el panel, el saldo del banco suma el último de cada cuenta, no el de una sola', () => {
    const statements = [
      month('a-ene', '2026-01', 100000),
      month('b-ene', '2026-01', 500000, { cuenta: CUENTA_B }),
    ];
    const ledger = buildLedger(statements);
    const byAccount = computeBankBalances(
      statements,
      (statement) => ledger.accountOf(statement.id)?.key ?? statement.bancoOrigen,
    );
    expect(byAccount).toEqual([{ bankId: 'bcp', balanceCents: 130000 + 530000, movementCount: 4 }]);
    // Sin saber de cuentas, el comportamiento anterior tomaba solo uno de los dos.
    expect(computeBankBalances(statements)[0]?.balanceCents).toBe(530000);
  });

  it('si un documento del banco no declara su cuenta, agrupa todo el banco como antes', () => {
    const ledger = buildLedger([
      month('a-ene', '2026-01', 100000),
      month('x-feb', '2026-02', 130000, { cuenta: null }),
    ]);
    expect(ledger.accounts).toHaveLength(1);
    expect(ledger.accounts[0]).toMatchObject({ porBanco: true, terminacion: null, continua: true });
    expect(ledger.issues).toContainEqual({ kind: 'CUENTA_NO_IDENTIFICADA', statementId: 'x-feb' });
  });
});

describe('buildLedger: cadena de periodos', () => {
  it('diciembre de un año y enero del siguiente son consecutivos', () => {
    const ledger = buildLedger([month('ene', '2026-01', 130000), month('dic', '2025-12', 100000)]);
    const [account] = ledger.accounts;
    expect(account).toMatchObject({
      continua: true,
      primerPeriodo: '2025-12',
      ultimoPeriodo: '2026-01',
      // El inicial es el del primer mes y el final el del último: nunca una suma de saldos.
      saldoInicial: 100000,
      saldoFinal: 160000,
      abonos: 100000,
      cargos: 40000,
    });
    expect(ledger.issues.filter((issue) => issue.kind !== 'CUENTA_NO_IDENTIFICADA')).toEqual([]);
  });

  it('un mes que falta rompe la cadena y no da saldo consolidado', () => {
    const ledger = buildLedger([month('ene', '2026-01', 100000), month('mar', '2026-03', 130000)]);
    expect(ledger.issues).toContainEqual({
      kind: 'PERIODOS_FALTANTES',
      accountKey: ledger.accounts[0]?.key,
      months: ['2026-02'],
    });
    expect(ledger.accounts[0]?.continua).toBe(false);
    expect(consolidatedBalance(ledger.accounts)).toEqual({
      kind: 'SIN_SALDO',
      motivo: 'CADENA_INCOMPLETA',
    });
  });

  it('un saldo inicial que no es el final anterior se señala', () => {
    const ledger = buildLedger([month('ene', '2026-01', 100000), month('feb', '2026-02', 999)]);
    expect(ledger.issues).toContainEqual(
      expect.objectContaining({
        kind: 'SALDO_DISCONTINUO',
        statementIds: ['ene', 'feb'],
        expectedCents: 130000,
        foundCents: 999,
      }),
    );
  });

  it('el día de corte compartido no es superposición; un periodo que se mete en otro, sí', () => {
    const shared = buildLedger([
      month('ene', '2026-01', 100000, {
        periodoDeclarado: { start: '2025-12-31', end: '2026-01-31' },
      }),
      month('feb', '2026-02', 130000, {
        periodoDeclarado: { start: '2026-01-31', end: '2026-02-28' },
      }),
    ]);
    expect(shared.accounts[0]?.continua).toBe(true);

    const overlapping = buildLedger([
      month('ene', '2026-01', 100000, {
        periodoDeclarado: { start: '2026-01-01', end: '2026-01-31' },
      }),
      month('ene-15', '2026-02', 130000, {
        periodoDeclarado: { start: '2026-01-15', end: '2026-02-14' },
      }),
    ]);
    expect(overlapping.issues).toContainEqual(
      expect.objectContaining({ kind: 'PERIODO_SUPERPUESTO', statementIds: ['ene', 'ene-15'] }),
    );
  });
});

describe('buildLedger: documentos repetidos', () => {
  it('aparta la copia exacta y conserva la primera, que es la más reciente del historial', () => {
    const original = month('nuevo', '2026-01', 100000);
    const copy = { ...month('viejo', '2026-01', 100000), nombreDocumento: 'otro nombre.pdf' };
    // Los ids de movimiento cambian con el trabajo; el contenido no.
    const ledger = buildLedger([original, copy]);
    expect(ledger.statements.map((statement) => statement.id)).toEqual(['nuevo']);
    expect(ledger.excluded.map(({ statement }) => statement.id)).toEqual(['viejo']);
    expect(ledger.issues).toContainEqual({
      kind: 'DOCUMENTO_DUPLICADO',
      statementId: 'viejo',
      duplicateOf: 'nuevo',
    });
    expect(computeTotals(ledger.rows)).toMatchObject({ creditCents: 50000, debitCents: 20000 });
  });

  it('el mismo periodo con contenido distinto no se aparta: se señala y se marcan las filas repetidas', () => {
    const first = month('a', '2026-01', 100000);
    // Otra conversión del mismo mes con un movimiento de más.
    const second = month('b', '2026-01', 100000, {
      movimientos: [
        ...month('b', '2026-01', 100000).movimientos,
        transactionFixture({ id: 'b-2', statementId: 'b', date: '2026-01-25', balanceCents: null }),
      ],
    });
    const ledger = buildLedger([first, second]);
    expect(ledger.statements).toHaveLength(2);
    expect(ledger.issues).toContainEqual(expect.objectContaining({ kind: 'PERIODO_SUPERPUESTO' }));
    const flagged = ledger.rows
      .filter((row) => row.possibleRepeat)
      .map((row) => row.transaction.id);
    expect(flagged.sort()).toEqual(['a-0', 'a-1', 'b-0', 'b-1']);
  });

  it('dos pagos iguales el mismo día, sin saldo impreso que los distinga, no se marcan', () => {
    const one = (id: string): FinancialStatement =>
      month(id, '2026-01', 0, {
        movimientos: [transactionFixture({ id: `${id}-0`, statementId: id, balanceCents: null })],
      });
    const ledger = buildLedger([one('a'), { ...one('b'), saldoFinal: 1 }]);
    expect(ledger.rows.some((row) => row.possibleRepeat)).toBe(false);
  });
});

describe('buildLedger: avisos por documento', () => {
  it('señala revisión, moneda supuesta, movimientos inconsistentes y fechas anteriores al arreglo', () => {
    const ledger = buildLedger([
      month('r', '2026-01', 0, {
        estado: 'NEEDS_REVIEW',
        monedaDeclarada: false,
        versionExtractor: '0.5.2',
        movimientos: [transactionFixture({ statementId: 'r', issues: ['SIGNO_INCONSISTENTE'] })],
      }),
    ]);
    expect(ledger.issues).toEqual(
      expect.arrayContaining([
        { kind: 'REQUIERE_REVISION', statementId: 'r' },
        { kind: 'MONEDA_SUPUESTA', statementId: 'r' },
        { kind: 'FECHAS_ANTERIORES_AL_ARREGLO', statementId: 'r' },
        { kind: 'MOVIMIENTOS_INCONSISTENTES', statementId: 'r', count: 1 },
      ]),
    );
  });

  it('solo BCP < 0.5.3 y Banco de la Nación < 0.4.1 fechaban mal los movimientos sin año', () => {
    expect(predatesYearFix(statementFixture({ versionExtractor: '0.5.2' }))).toBe(true);
    expect(predatesYearFix(statementFixture({ versionExtractor: '0.5.3' }))).toBe(false);
    expect(predatesYearFix(statementFixture({ versionExtractor: '1.0.0' }))).toBe(false);
    expect(
      predatesYearFix(statementFixture({ bancoOrigen: 'nacion', versionExtractor: '0.4.0' })),
    ).toBe(true);
    expect(
      predatesYearFix(statementFixture({ bancoOrigen: 'bbva', versionExtractor: '0.1.0' })),
    ).toBe(false);
    expect(predatesYearFix(statementFixture({ versionExtractor: null }))).toBe(false);
  });
});

describe('consolidatedBalance', () => {
  it('suma cuentas distintas solo si cubren los mismos meses sin huecos', () => {
    const same = buildLedger([
      month('a', '2026-01', 100000),
      month('b', '2026-01', 500000, { cuenta: CUENTA_B }),
    ]);
    expect(consolidatedBalance(same.accounts)).toEqual({
      kind: 'CONCILIADO',
      saldoInicial: 600000,
      saldoFinal: 660000,
      desde: '2026-01',
      hasta: '2026-01',
    });

    const different = buildLedger([
      month('a', '2026-01', 100000),
      month('b', '2026-02', 500000, { cuenta: CUENTA_B }),
    ]);
    expect(consolidatedBalance(different.accounts)).toEqual({
      kind: 'SIN_SALDO',
      motivo: 'PERIODOS_DISTINTOS',
    });
    expect(consolidatedBalance([])).toEqual({ kind: 'SIN_SALDO', motivo: 'SIN_CUENTAS' });
  });
});

describe('alcance, filtros y orden', () => {
  // Enero trae un YAPE del 31 de diciembre anterior: es del documento de enero.
  const enero = month('ene', '2026-01', 130000, {
    movimientos: [
      ...month('ene', '2026-01', 130000).movimientos,
      transactionFixture({
        id: 'ene-tarde',
        statementId: 'ene',
        date: '2025-12-31',
        description: 'YAPE tardío',
        source: { page: 1, row: 0 },
      }),
    ],
  });
  const ledger = buildLedger([
    month('dic', '2025-12', 100000),
    enero,
    month('ibk', '2026-01', 9000, { bancoOrigen: 'interbank', cuenta: CUENTA_B }),
  ]);

  it('anexa todo en orden cronológico; a igual fecha, por periodo del documento', () => {
    const dates = ledger.rows.map((row) => row.transaction.date);
    expect(dates).toEqual([...dates].sort());
    const lastDecember = ledger.rows.filter((row) => row.transaction.date === '2025-12-31');
    expect(lastDecember.map((row) => row.statement.fechaPeriodo)).toEqual(['2026-01']);
  });

  it('en Normal cuenta el mes del documento, no el de la fecha del movimiento', () => {
    const january = rowsInScope(ledger.rows, 'periodo', '2026-01');
    expect(january.map((row) => row.transaction.id)).toContain('ene-tarde');
    expect(rowsInScope(ledger.rows, 'periodo', '2025-12').map((row) => row.statement.id)).toEqual([
      'dic',
      'dic',
    ]);
  });

  it('en Acumulado la búsqueda recorre todos los periodos, sin distinguir tildes', () => {
    const all = rowsInScope(ledger.rows, 'acumulado', '2026-01');
    const yape = filterLedgerRows(all, { ...NO_FILTERS, search: 'yape tardio' });
    expect(yape.map((row) => row.transaction.id)).toEqual(['ene-tarde']);
    const everyYape = filterLedgerRows(all, { ...NO_FILTERS, search: 'YAPE' });
    expect(new Set(everyYape.map((row) => row.statement.fechaPeriodo))).toEqual(
      new Set(['2025-12', '2026-01']),
    );
  });

  it('combina banco, cuenta, periodo y fechas', () => {
    const all = rowsInScope(ledger.rows, 'acumulado', '');
    const bcpAccount = ledger.accounts.find((account) => account.bankId === 'bcp')?.key ?? '';
    const filtered = filterLedgerRows(all, {
      ...NO_FILTERS,
      banks: new Set(['bcp']),
      accounts: new Set([bcpAccount]),
      periods: new Set(['2026-01']),
      dateFrom: '2026-01-01',
      dateTo: '2026-01-10',
    });
    expect(filtered.map((row) => row.transaction.id)).toEqual(['ene-0']);
  });

  it('ordena por columna y desempata cronológicamente', () => {
    const all = rowsInScope(ledger.rows, 'acumulado', '');
    const byDebit = sortLedgerRows(all, { key: 'cargo', direction: 'desc' });
    expect(byDebit[0]?.transaction.debitCents).toBe(20000);
    const byBalance = sortLedgerRows(all, { key: 'saldo', direction: 'desc' });
    // Sin saldo impreso va al final.
    expect(byBalance.at(-1)?.transaction.balanceCents).toBeNull();
  });

  it('totaliza cargos y abonos de las filas y da subtotales por cuenta y periodo', () => {
    const all = rowsInScope(ledger.rows, 'acumulado', '');
    const totals = computeTotals(all);
    expect(totals).toEqual({
      count: 7,
      creditCents: 3 * 50000 + 10000,
      debitCents: 3 * 20000,
      netCents: 3 * 50000 + 10000 - 3 * 20000,
    });
    const byPeriod = computeSubtotals(all, 'periodo');
    expect(byPeriod.map((subtotal) => [subtotal.key, subtotal.count])).toEqual([
      ['2025-12', 2],
      ['2026-01', 5],
    ]);
    const byAccount = computeSubtotals(all, 'cuenta');
    expect(byAccount.reduce((total, subtotal) => total + subtotal.count, 0)).toBe(7);
    expect(computeSubtotals(all, 'banco').map((subtotal) => subtotal.key)).toEqual([
      'bcp',
      'interbank',
    ]);
  });
});

describe('monedas', () => {
  it('soles y dólares del mismo banco son cuentas distintas', () => {
    const ledger = buildLedger([
      month('pen', '2026-01', 100000),
      month('usd', '2026-01', 100000, { moneda: 'USD', cuenta: CUENTA_B }),
    ]);
    expect(ledger.accounts.map((account) => account.currency)).toEqual(['PEN', 'USD']);
  });
});
