import { describe, expect, it } from 'vitest';

import type { FinancialTransaction } from './types';
import {
  computeBankBalances,
  computeFlowTotals,
  filterByBanks,
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

const SAMPLE: FinancialTransaction[] = [
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

describe('filterByBanks', () => {
  it('sin selección devuelve todo (equivale a "todos los bancos")', () => {
    expect(filterByBanks(SAMPLE, new Set())).toHaveLength(3);
  });

  it('con selección solo deja los bancos elegidos', () => {
    const result = filterByBanks(SAMPLE, new Set(['bbva']));
    expect(result.map((t) => t.id)).toEqual(['c']);
  });
});

describe('computeFlowTotals', () => {
  it('sin movimientos no inventa datos', () => {
    expect(computeFlowTotals([])).toEqual({
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      movementCount: 0,
      reconciledCount: 0,
    });
  });

  it('suma ingresos, gastos y detecta reconciliaciones', () => {
    const totals = computeFlowTotals(SAMPLE);
    expect(totals.incomeCents).toBe(50000);
    expect(totals.expenseCents).toBe(35000);
    expect(totals.netCents).toBe(50000 - 35000);
    expect(totals.movementCount).toBe(3);
    expect(totals.reconciledCount).toBe(2);
  });
});

describe('computeBankBalances', () => {
  it('incluye los cuatro bancos aunque no tengan movimientos', () => {
    const balances = computeBankBalances(SAMPLE);
    const byBank = Object.fromEntries(balances.map((b) => [b.bankId, b]));

    expect(byBank.bcp).toEqual({ bankId: 'bcp', balanceCents: 30000, movementCount: 2 });
    expect(byBank.bbva).toEqual({ bankId: 'bbva', balanceCents: -15000, movementCount: 1 });
    expect(byBank.interbank).toEqual({ bankId: 'interbank', balanceCents: 0, movementCount: 0 });
    expect(byBank.scotiabank).toEqual({ bankId: 'scotiabank', balanceCents: 0, movementCount: 0 });
  });
});

describe('groupByDate', () => {
  it('agrupa y ordena del día más reciente al más antiguo', () => {
    const groups = groupByDate(SAMPLE);
    expect(groups.map((g) => g.date)).toEqual(['2026-02-20', '2026-02-10']);
    expect(groups[1]?.items.map((t) => t.id)).toEqual(['b', 'c']);
  });
});
