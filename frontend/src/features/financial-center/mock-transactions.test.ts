import { describe, expect, it } from 'vitest';

import { generateMockTransactions } from './mock-transactions';

const REFERENCE_DATE = new Date('2026-09-14T00:00:00.000Z');

describe('generateMockTransactions', () => {
  it('es determinista para una misma semilla', () => {
    const first = generateMockTransactions(1, REFERENCE_DATE);
    const second = generateMockTransactions(1, REFERENCE_DATE);
    expect(second).toEqual(first);
  });

  it('produce data distinta con otra semilla', () => {
    const first = generateMockTransactions(1, REFERENCE_DATE);
    const other = generateMockTransactions(2, REFERENCE_DATE);
    expect(other).not.toEqual(first);
  });

  it('cubre los cuatro bancos con montos en centavos enteros', () => {
    const transactions = generateMockTransactions(7, REFERENCE_DATE);
    expect(transactions.length).toBeGreaterThan(300);

    const bankIds = new Set(transactions.map((transaction) => transaction.bankId));
    expect(bankIds).toEqual(new Set(['bcp', 'bbva', 'interbank', 'scotiabank']));

    for (const transaction of transactions) {
      expect(Number.isInteger(transaction.amountCents)).toBe(true);
      expect(transaction.amountCents).toBeGreaterThan(0);
    }
  });

  it('ordena los movimientos del más reciente al más antiguo', () => {
    const transactions = generateMockTransactions(3, REFERENCE_DATE);
    for (let i = 1; i < transactions.length; i += 1) {
      const current = transactions[i]?.date ?? '';
      const previous = transactions[i - 1]?.date ?? '';
      expect(current <= previous).toBe(true);
    }
  });
});
