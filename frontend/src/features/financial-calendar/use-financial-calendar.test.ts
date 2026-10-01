import { describe, expect, it } from 'vitest';

import type { FinancialStatement, FinancialTransaction } from '@/features/financial-center/types';

import {
  computeBalanceBeforeMonth,
  computeDailyFlows,
  computeMonthlyBalances,
  computeMonthRange,
  computeMonthSummary,
  computeOpeningBalances,
  filterByDate,
  filterByMonth,
} from './use-financial-calendar';

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

const SAMPLE: FinancialTransaction[] = [
  tx({ id: 'a', date: '2026-01-05', type: 'ABONO', amountCents: 50000 }),
  tx({
    id: 'b',
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
  tx({ id: 'd', bankId: 'bbva', date: '2026-02-20', type: 'ABONO', amountCents: 5000 }),
];

describe('filterByMonth', () => {
  it('deja solo los movimientos de ese mes', () => {
    expect(filterByMonth(SAMPLE, '2026-02').map((t) => t.id)).toEqual(['b', 'c', 'd']);
  });
});

describe('filterByDate', () => {
  it('deja solo los movimientos de ese día exacto', () => {
    expect(filterByDate(SAMPLE, '2026-02-10').map((t) => t.id)).toEqual(['b', 'c']);
  });
});

describe('computeDailyFlows', () => {
  it('agrupa por fecha sumando abonos y restando cargos en el neto', () => {
    const flows = computeDailyFlows(filterByMonth(SAMPLE, '2026-02'));
    expect(flows.get('2026-02-10')).toEqual({
      incomeCents: 0,
      expenseCents: 35000,
      netCents: -35000,
      count: 2,
    });
    expect(flows.get('2026-02-20')).toEqual({
      incomeCents: 5000,
      expenseCents: 0,
      netCents: 5000,
      count: 1,
    });
  });
});

describe('computeBalanceBeforeMonth y computeMonthlyBalances', () => {
  it('arrastra el saldo de meses previos y lo va acumulando día a día', () => {
    const before = computeBalanceBeforeMonth(SAMPLE, '2026-02');
    expect(before).toBe(50000);

    const flows = computeDailyFlows(filterByMonth(SAMPLE, '2026-02'));
    const balances = computeMonthlyBalances('2026-02', before, flows);

    expect(balances.get('2026-02-01')).toBe(50000);
    expect(balances.get('2026-02-10')).toBe(50000 - 35000);
    expect(balances.get('2026-02-20')).toBe(50000 - 35000 + 5000);
    expect(balances.get('2026-02-28')).toBe(50000 - 35000 + 5000);
  });
});

describe('computeMonthSummary', () => {
  it('calcula entradas, salidas y el saldo de cierre a partir del saldo previo', () => {
    const before = computeBalanceBeforeMonth(SAMPLE, '2026-02');
    const summary = computeMonthSummary(filterByMonth(SAMPLE, '2026-02'), before);

    expect(summary.incomeCents).toBe(5000);
    expect(summary.expenseCents).toBe(35000);
    expect(summary.netCents).toBe(5000 - 35000);
    expect(summary.closingBalanceCents).toBe(50000 + 5000 - 35000);
    expect(summary.movementCount).toBe(3);
  });

  it('sin movimientos, el cierre es igual al saldo que traía', () => {
    const summary = computeMonthSummary([], 12000);
    expect(summary).toEqual({
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      closingBalanceCents: 12000,
      movementCount: 0,
    });
  });
});

function statement(overrides: Partial<FinancialStatement>): FinancialStatement {
  return {
    id: 'job-1',
    bancoOrigen: 'bcp',
    fechaPeriodo: '2026-01',
    periodoLabel: 'Enero de 2026',
    saldoInicial: 0,
    abonos: 0,
    cargos: 0,
    saldoFinal: 0,
    movimientos: [],
    ...overrides,
  };
}

describe('computeOpeningBalances', () => {
  it('toma el saldo inicial del documento más antiguo de cada banco, no el de todos', () => {
    const openings = computeOpeningBalances([
      statement({ id: 'feb', fechaPeriodo: '2026-02', saldoInicial: 80000 }),
      statement({ id: 'ene', fechaPeriodo: '2026-01', saldoInicial: 30000 }),
      statement({
        id: 'ibk',
        bancoOrigen: 'interbank',
        fechaPeriodo: '2026-02',
        saldoInicial: 500,
      }),
    ]);
    expect(openings).toEqual(
      expect.arrayContaining([
        { bankId: 'bcp', monthKey: '2026-01', cents: 30000 },
        { bankId: 'interbank', monthKey: '2026-02', cents: 500 },
      ]),
    );
    expect(openings).toHaveLength(2);
  });

  it('suma dos cuentas del mismo banco en su mes más antiguo', () => {
    expect(
      computeOpeningBalances([
        statement({ id: 'a', saldoInicial: 100 }),
        statement({ id: 'b', saldoInicial: 250 }),
      ]),
    ).toEqual([{ bankId: 'bcp', monthKey: '2026-01', cents: 350 }]);
  });
});

describe('computeBalanceBeforeMonth con saldo inicial', () => {
  it('cuenta el saldo inicial desde su mes, no antes', () => {
    const openings = [{ bankId: 'bcp' as const, monthKey: '2026-02', cents: 1000 }];
    expect(computeBalanceBeforeMonth([], '2026-01', openings)).toBe(0);
    expect(computeBalanceBeforeMonth([], '2026-02', openings)).toBe(1000);
  });
});

describe('computeMonthRange', () => {
  it('abarca periodos y fechas de movimientos; sin documentos no hay rango', () => {
    expect(computeMonthRange([])).toBeNull();
    expect(
      computeMonthRange([
        statement({
          fechaPeriodo: '2026-02',
          movimientos: [tx({ date: '2026-01-31' }), tx({ date: '2026-03-01' })],
        }),
      ]),
    ).toEqual({ min: '2026-01', max: '2026-03' });
  });
});
