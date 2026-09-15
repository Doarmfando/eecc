import { describe, expect, it } from 'vitest';

import type { FinancialTransaction } from '@/features/financial-center/types';

import {
  computeBalanceBeforeMonth,
  computeDailyFlows,
  computeMonthlyBalances,
  computeMonthSummary,
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
