import { describe, expect, it } from 'vitest';

import type { FinancialTransaction } from './types';
import {
  computeBankDistribution,
  computeFlowBreakdown,
  computeKpis,
  filterTransactions,
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
  tx({ id: 'a', bankId: 'bcp', date: '2026-01-05', type: 'ABONO', amountCents: 50000 }),
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
    date: '2026-02-20',
    type: 'CARGO',
    amountCents: 15000,
    description: 'Pago de nómina — Planilla mensual',
    category: 'Nómina',
  }),
];

describe('filterTransactions', () => {
  it('sin filtros devuelve todo', () => {
    expect(
      filterTransactions(SAMPLE, {
        selectedBanks: new Set(),
        search: '',
        monthFrom: '',
        monthTo: '',
      }),
    ).toHaveLength(3);
  });

  it('filtra por banco cuando hay una selección', () => {
    const result = filterTransactions(SAMPLE, {
      selectedBanks: new Set(['bbva']),
      search: '',
      monthFrom: '',
      monthTo: '',
    });
    expect(result.map((t) => t.id)).toEqual(['c']);
  });

  it('filtra por rango de mes (desde/hasta)', () => {
    const fromFeb = filterTransactions(SAMPLE, {
      selectedBanks: new Set(),
      search: '',
      monthFrom: '2026-02',
      monthTo: '',
    });
    expect(fromFeb.map((t) => t.id)).toEqual(['b', 'c']);

    const onlyJan = filterTransactions(SAMPLE, {
      selectedBanks: new Set(),
      search: '',
      monthFrom: '',
      monthTo: '2026-01',
    });
    expect(onlyJan.map((t) => t.id)).toEqual(['a']);
  });

  it('busca por descripción o categoría, sin distinguir mayúsculas', () => {
    const bySunat = filterTransactions(SAMPLE, {
      selectedBanks: new Set(),
      search: 'sunat',
      monthFrom: '',
      monthTo: '',
    });
    expect(bySunat.map((t) => t.id)).toEqual(['b']);

    const byCategory = filterTransactions(SAMPLE, {
      selectedBanks: new Set(),
      search: 'nómina',
      monthFrom: '',
      monthTo: '',
    });
    expect(byCategory.map((t) => t.id)).toEqual(['c']);
  });
});

describe('computeKpis', () => {
  it('sin movimientos no inventa una tasa de precisión', () => {
    const kpis = computeKpis([]);
    expect(kpis).toEqual({
      totalFlowCents: 0,
      movementCount: 0,
      reconciledCount: 0,
      netBalanceCents: 0,
      precisionRate: 1,
      isBalanced: true,
    });
  });

  it('suma el flujo total y el saldo neto por tipo de movimiento', () => {
    const kpis = computeKpis(SAMPLE);
    expect(kpis.totalFlowCents).toBe(50000 + 20000 + 15000);
    expect(kpis.netBalanceCents).toBe(50000 - 20000 - 15000);
    expect(kpis.movementCount).toBe(3);
  });

  it('detecta discrepancias cuando algún movimiento no reconcilia', () => {
    const kpis = computeKpis(SAMPLE);
    expect(kpis.reconciledCount).toBe(2);
    expect(kpis.precisionRate).toBeCloseTo(2 / 3);
    expect(kpis.isBalanced).toBe(false);
  });
});

describe('computeBankDistribution', () => {
  it('incluye los cuatro bancos aunque no tengan movimientos filtrados', () => {
    const distribution = computeBankDistribution(SAMPLE);
    const byBank = Object.fromEntries(distribution.map((item) => [item.bankId, item]));

    expect(byBank.bcp?.count).toBe(2);
    expect(byBank.bbva?.count).toBe(1);
    expect(byBank.interbank?.count).toBe(0);
    expect(byBank.scotiabank?.count).toBe(0);
    expect(byBank.interbank?.share).toBe(0);
  });

  it('no divide por cero cuando no hay movimientos', () => {
    const distribution = computeBankDistribution([]);
    for (const item of distribution) {
      expect(item.share).toBe(0);
    }
  });
});

describe('computeFlowBreakdown', () => {
  it('separa abonos de cargos', () => {
    const breakdown = computeFlowBreakdown(SAMPLE);
    expect(breakdown.incomeCents).toBe(50000);
    expect(breakdown.expenseCents).toBe(35000);
    expect(breakdown.incomeShare).toBe(1);
    expect(breakdown.expenseShare).toBeCloseTo(35000 / 50000);
  });

  it('no divide por cero cuando no hay movimientos', () => {
    const breakdown = computeFlowBreakdown([]);
    expect(breakdown).toEqual({
      incomeCents: 0,
      expenseCents: 0,
      incomeShare: 0,
      expenseShare: 0,
    });
  });
});
