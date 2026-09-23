import { describe, expect, it } from 'vitest';

import type { FinancialStatement, FinancialTransaction } from './types';
import {
  computeAvailableMonths,
  computeBankBalances,
  computePeriodSummary,
  filterByBanks,
  filterBySearch,
  filterStatementsByBanks,
  filterStatementsByMonth,
  groupByDate,
} from './use-financial-center';

function tx(overrides: Partial<FinancialTransaction>): FinancialTransaction {
  return {
    id: 'tx-1',
    bankId: 'bcp',
    date: '2026-01-15',
    description: 'Transferencia recibida — Cliente corporativo',
    category: 'Transferencias',
    type: 'ABONO',
    amountCents: 10000,
    reconciled: true,
    ...overrides,
  };
}

const SAMPLE_MOVEMENTS: FinancialTransaction[] = [
  tx({ id: 'a', bankId: 'bcp', date: '2026-02-20', type: 'ABONO', amountCents: 50000 }),
  tx({
    id: 'b',
    bankId: 'bcp',
    date: '2026-02-10',
    type: 'CARGO',
    amountCents: 20000,
    description: 'Pago SUNAT — Tributos',
    category: 'Impuestos',
    reconciled: false,
  }),
  tx({
    id: 'c',
    bankId: 'bbva',
    date: '2026-02-10',
    type: 'CARGO',
    amountCents: 15000,
    description: 'Pago de nómina — Planilla mensual',
    category: 'Nómina',
  }),
];

function statement(overrides: Partial<FinancialStatement>): FinancialStatement {
  return {
    id: 'bcp-2026-02',
    bancoOrigen: 'bcp',
    fechaPeriodo: '2026-02',
    periodoLabel: 'Febrero de 2026',
    saldoInicial: 0,
    abonos: 0,
    cargos: 0,
    saldoFinal: 0,
    movimientos: [],
    ...overrides,
  };
}

const SAMPLE_STATEMENTS: FinancialStatement[] = [
  statement({
    id: 'bcp-2026-01',
    bancoOrigen: 'bcp',
    fechaPeriodo: '2026-01',
    periodoLabel: 'Enero de 2026',
    saldoInicial: 100000,
    abonos: 50000,
    cargos: 20000,
    saldoFinal: 130000,
    movimientos: [tx({ id: 'jan-1', date: '2026-01-05', amountCents: 50000 })],
  }),
  statement({
    id: 'bcp-2026-02',
    bancoOrigen: 'bcp',
    fechaPeriodo: '2026-02',
    saldoInicial: 130000,
    abonos: 50000,
    cargos: 20000,
    saldoFinal: 160000,
    movimientos: [SAMPLE_MOVEMENTS[0]!, SAMPLE_MOVEMENTS[1]!],
  }),
  statement({
    id: 'bbva-2026-02',
    bancoOrigen: 'bbva',
    fechaPeriodo: '2026-02',
    saldoInicial: 40000,
    abonos: 0,
    cargos: 15000,
    saldoFinal: 25000,
    movimientos: [SAMPLE_MOVEMENTS[2]!],
  }),
];

describe('filterByBanks', () => {
  it('sin selección devuelve todo (equivale a "todos los bancos")', () => {
    expect(filterByBanks(SAMPLE_MOVEMENTS, new Set())).toHaveLength(3);
  });

  it('con selección solo deja los bancos elegidos', () => {
    const result = filterByBanks(SAMPLE_MOVEMENTS, new Set(['bbva']));
    expect(result.map((t) => t.id)).toEqual(['c']);
  });
});

describe('filterBySearch', () => {
  it('sin texto devuelve todo', () => {
    expect(filterBySearch(SAMPLE_MOVEMENTS, '')).toHaveLength(3);
    expect(filterBySearch(SAMPLE_MOVEMENTS, '   ')).toHaveLength(3);
  });

  it('busca por descripción o categoría, sin distinguir mayúsculas', () => {
    expect(filterBySearch(SAMPLE_MOVEMENTS, 'sunat').map((t) => t.id)).toEqual(['b']);
    expect(filterBySearch(SAMPLE_MOVEMENTS, 'nómina').map((t) => t.id)).toEqual(['c']);
  });

  it('sin coincidencias devuelve una lista vacía', () => {
    expect(filterBySearch(SAMPLE_MOVEMENTS, 'no existe esto')).toEqual([]);
  });
});

describe('filterStatementsByBanks', () => {
  it('sin selección devuelve todos los EECC', () => {
    expect(filterStatementsByBanks(SAMPLE_STATEMENTS, new Set())).toHaveLength(3);
  });

  it('con selección solo deja los EECC de esos bancos', () => {
    const result = filterStatementsByBanks(SAMPLE_STATEMENTS, new Set(['bbva']));
    expect(result.map((s) => s.id)).toEqual(['bbva-2026-02']);
  });
});

describe('filterStatementsByMonth', () => {
  it('deja solo los EECC de ese periodo', () => {
    const result = filterStatementsByMonth(SAMPLE_STATEMENTS, '2026-02');
    expect(result.map((s) => s.id)).toEqual(['bcp-2026-02', 'bbva-2026-02']);
  });
});

describe('computeAvailableMonths', () => {
  it('devuelve los meses con al menos un EECC, sin repetir y ordenados', () => {
    expect(computeAvailableMonths(SAMPLE_STATEMENTS)).toEqual(['2026-01', '2026-02']);
  });
});

describe('computePeriodSummary', () => {
  it('sin EECC no inventa datos', () => {
    expect(computePeriodSummary([])).toEqual({
      saldoInicial: 0,
      abonos: 0,
      cargos: 0,
      saldoFinal: 0,
      movementCount: 0,
      reconciledCount: 0,
    });
  });

  it('agrega saldo inicial, abonos, cargos y saldo final de los EECC del periodo', () => {
    const summary = computePeriodSummary(filterStatementsByMonth(SAMPLE_STATEMENTS, '2026-02'));
    expect(summary.saldoInicial).toBe(130000 + 40000);
    expect(summary.abonos).toBe(50000);
    expect(summary.cargos).toBe(20000 + 15000);
    expect(summary.saldoFinal).toBe(160000 + 25000);
    expect(summary.movementCount).toBe(3);
    expect(summary.reconciledCount).toBe(2);
  });
});

describe('computeBankBalances', () => {
  it('solo incluye los bancos con EECC cargados, en orden de presentación', () => {
    const balances = computeBankBalances(SAMPLE_STATEMENTS);

    // Un banco sin documentos no tiene saldo que mostrar: una fila en cero se
    // leería como «tu cuenta está vacía».
    expect(balances.map((balance) => balance.bankId)).toEqual(['bcp', 'bbva']);
  });

  it('da lugar a los bancos que no están en el selector de carga', () => {
    const balances = computeBankBalances([
      statement({ id: 'n', bancoOrigen: 'nacion', saldoFinal: 5000 }),
      statement({ id: 'o', bancoOrigen: 'otro', saldoFinal: 700 }),
    ]);

    expect(balances.map((balance) => balance.bankId)).toEqual(['nacion', 'otro']);
  });

  it('usa el saldo final del EECC más reciente de cada banco, no una suma', () => {
    const balances = computeBankBalances(SAMPLE_STATEMENTS);
    const byBank = Object.fromEntries(balances.map((b) => [b.bankId, b]));

    // BCP tiene enero y febrero: debe quedarse con el saldoFinal de febrero (el más reciente).
    expect(byBank.bcp).toEqual({ bankId: 'bcp', balanceCents: 160000, movementCount: 3 });
    expect(byBank.bbva).toEqual({ bankId: 'bbva', balanceCents: 25000, movementCount: 1 });
  });
});

describe('groupByDate', () => {
  it('agrupa y ordena del día más reciente al más antiguo', () => {
    const groups = groupByDate(SAMPLE_MOVEMENTS);
    expect(groups.map((g) => g.date)).toEqual(['2026-02-20', '2026-02-10']);
    expect(groups[1]?.items.map((t) => t.id)).toEqual(['b', 'c']);
  });
});
