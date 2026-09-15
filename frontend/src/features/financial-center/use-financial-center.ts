import { useMemo, useState } from 'react';

import type { BankId } from '@/features/statements/bank-selector';

import type { FinancialTransaction } from './types';

export const ALL_BANK_IDS: readonly BankId[] = ['bcp', 'bbva', 'interbank', 'scotiabank'];

export interface BankDistributionItem {
  bankId: BankId;
  count: number;
  amountCents: number;
  share: number;
}

export interface FlowBreakdown {
  incomeCents: number;
  expenseCents: number;
  incomeShare: number;
  expenseShare: number;
}

export interface FinancialKpis {
  totalFlowCents: number;
  movementCount: number;
  reconciledCount: number;
  netBalanceCents: number;
  precisionRate: number;
  isBalanced: boolean;
}

export interface FinancialFilters {
  selectedBanks: ReadonlySet<BankId>;
  search: string;
  monthFrom: string;
  monthTo: string;
}

/** `selectedBanks` vacío significa "todos los bancos": no hay filtro que aplicar. */
export function filterTransactions(
  transactions: readonly FinancialTransaction[],
  filters: FinancialFilters,
): FinancialTransaction[] {
  const query = filters.search.trim().toLowerCase();

  return transactions.filter((transaction) => {
    if (filters.selectedBanks.size > 0 && !filters.selectedBanks.has(transaction.bankId)) {
      return false;
    }
    const month = transaction.date.slice(0, 7);
    if (filters.monthFrom && month < filters.monthFrom) {
      return false;
    }
    if (filters.monthTo && month > filters.monthTo) {
      return false;
    }
    if (
      query &&
      !transaction.description.toLowerCase().includes(query) &&
      !transaction.category.toLowerCase().includes(query)
    ) {
      return false;
    }
    return true;
  });
}

export function computeKpis(transactions: readonly FinancialTransaction[]): FinancialKpis {
  let totalFlowCents = 0;
  let netBalanceCents = 0;
  let reconciledCount = 0;

  for (const transaction of transactions) {
    totalFlowCents += transaction.amountCents;
    netBalanceCents +=
      transaction.type === 'ABONO' ? transaction.amountCents : -transaction.amountCents;
    if (transaction.reconciled) {
      reconciledCount += 1;
    }
  }

  const movementCount = transactions.length;
  return {
    totalFlowCents,
    movementCount,
    reconciledCount,
    netBalanceCents,
    precisionRate: movementCount > 0 ? reconciledCount / movementCount : 1,
    isBalanced: movementCount === 0 || reconciledCount === movementCount,
  };
}

export function computeBankDistribution(
  transactions: readonly FinancialTransaction[],
): BankDistributionItem[] {
  const byBank = new Map<BankId, { count: number; amountCents: number }>(
    ALL_BANK_IDS.map((bankId) => [bankId, { count: 0, amountCents: 0 }]),
  );

  for (const transaction of transactions) {
    const bucket = byBank.get(transaction.bankId);
    if (bucket) {
      bucket.count += 1;
      bucket.amountCents += transaction.amountCents;
    }
  }

  const maxCount = Math.max(1, ...Array.from(byBank.values(), (bucket) => bucket.count));

  return ALL_BANK_IDS.map((bankId) => {
    const bucket = byBank.get(bankId) ?? { count: 0, amountCents: 0 };
    return { bankId, ...bucket, share: bucket.count / maxCount };
  });
}

export function computeFlowBreakdown(transactions: readonly FinancialTransaction[]): FlowBreakdown {
  let incomeCents = 0;
  let expenseCents = 0;

  for (const transaction of transactions) {
    if (transaction.type === 'ABONO') {
      incomeCents += transaction.amountCents;
    } else {
      expenseCents += transaction.amountCents;
    }
  }

  const max = Math.max(1, incomeCents, expenseCents);
  return {
    incomeCents,
    expenseCents,
    incomeShare: incomeCents / max,
    expenseShare: expenseCents / max,
  };
}

export interface FinancialCenterState {
  selectedBanks: ReadonlySet<BankId>;
  toggleBank: (bankId: BankId) => void;
  selectAllBanks: () => void;
  search: string;
  setSearch: (search: string) => void;
  monthFrom: string;
  setMonthFrom: (month: string) => void;
  monthTo: string;
  setMonthTo: (month: string) => void;
  filtered: FinancialTransaction[];
  kpis: FinancialKpis;
  bankDistribution: BankDistributionItem[];
  flowBreakdown: FlowBreakdown;
}

export function useFinancialCenter(
  transactions: readonly FinancialTransaction[],
): FinancialCenterState {
  const [selectedBanks, setSelectedBanks] = useState<ReadonlySet<BankId>>(new Set());
  const [search, setSearch] = useState('');
  const [monthFrom, setMonthFrom] = useState('');
  const [monthTo, setMonthTo] = useState('');

  const toggleBank = (bankId: BankId): void => {
    setSelectedBanks((current) => {
      const next = new Set(current);
      if (next.has(bankId)) {
        next.delete(bankId);
      } else {
        next.add(bankId);
      }
      return next;
    });
  };

  const selectAllBanks = (): void => {
    setSelectedBanks(new Set());
  };

  const filtered = useMemo(
    () => filterTransactions(transactions, { selectedBanks, search, monthFrom, monthTo }),
    [transactions, selectedBanks, search, monthFrom, monthTo],
  );

  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const bankDistribution = useMemo(() => computeBankDistribution(filtered), [filtered]);
  const flowBreakdown = useMemo(() => computeFlowBreakdown(filtered), [filtered]);

  return {
    selectedBanks,
    toggleBank,
    selectAllBanks,
    search,
    setSearch,
    monthFrom,
    setMonthFrom,
    monthTo,
    setMonthTo,
    filtered,
    kpis,
    bankDistribution,
    flowBreakdown,
  };
}
