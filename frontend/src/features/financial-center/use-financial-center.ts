import { useEffect, useMemo, useState } from 'react';

import type { BankId } from '@/features/statements/bank-selector';

import type { FinancialTransaction } from './types';

export const ALL_BANK_IDS: readonly BankId[] = ['bcp', 'bbva', 'interbank', 'scotiabank'];

/** Cuántas filas se muestran de entrada; "Cargar más" las suma de a una página. */
const PAGE_SIZE = 15;

export interface FlowTotals {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  movementCount: number;
  reconciledCount: number;
}

export interface BankBalance {
  bankId: BankId;
  balanceCents: number;
  movementCount: number;
}

export interface TransactionGroup {
  date: string;
  items: FinancialTransaction[];
}

/** `selectedBanks` vacío significa "todos los bancos": no hay filtro que aplicar. */
export function filterByBanks(
  transactions: readonly FinancialTransaction[],
  selectedBanks: ReadonlySet<BankId>,
): FinancialTransaction[] {
  if (selectedBanks.size === 0) {
    return [...transactions];
  }
  return transactions.filter((transaction) => selectedBanks.has(transaction.bankId));
}

export function filterBySearch(
  transactions: readonly FinancialTransaction[],
  search: string,
): FinancialTransaction[] {
  const query = search.trim().toLowerCase();
  if (!query) {
    return [...transactions];
  }
  return transactions.filter(
    (transaction) =>
      transaction.description.toLowerCase().includes(query) ||
      transaction.category.toLowerCase().includes(query),
  );
}

export function computeFlowTotals(transactions: readonly FinancialTransaction[]): FlowTotals {
  let incomeCents = 0;
  let expenseCents = 0;
  let reconciledCount = 0;

  for (const transaction of transactions) {
    if (transaction.type === 'ABONO') {
      incomeCents += transaction.amountCents;
    } else {
      expenseCents += transaction.amountCents;
    }
    if (transaction.reconciled) {
      reconciledCount += 1;
    }
  }

  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    movementCount: transactions.length,
    reconciledCount,
  };
}

/** Siempre los cuatro bancos, con o sin movimientos: la lista de cuentas no debe "saltar". */
export function computeBankBalances(transactions: readonly FinancialTransaction[]): BankBalance[] {
  const byBank = new Map<BankId, { balanceCents: number; movementCount: number }>(
    ALL_BANK_IDS.map((bankId) => [bankId, { balanceCents: 0, movementCount: 0 }]),
  );

  for (const transaction of transactions) {
    const bucket = byBank.get(transaction.bankId);
    if (bucket) {
      bucket.balanceCents +=
        transaction.type === 'ABONO' ? transaction.amountCents : -transaction.amountCents;
      bucket.movementCount += 1;
    }
  }

  return ALL_BANK_IDS.map((bankId) => ({
    bankId,
    ...(byBank.get(bankId) ?? { balanceCents: 0, movementCount: 0 }),
  }));
}

export function groupByDate(transactions: readonly FinancialTransaction[]): TransactionGroup[] {
  const byDate = new Map<string, FinancialTransaction[]>();
  for (const transaction of transactions) {
    const items = byDate.get(transaction.date);
    if (items) {
      items.push(transaction);
    } else {
      byDate.set(transaction.date, [transaction]);
    }
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

export interface FinancialCenterState {
  selectedBanks: ReadonlySet<BankId>;
  toggleBank: (bankId: BankId) => void;
  selectAllBanks: () => void;
  search: string;
  setSearch: (search: string) => void;
  flowTotals: FlowTotals;
  bankBalances: BankBalance[];
  movementGroups: TransactionGroup[];
  shownMovementCount: number;
  totalMovementCount: number;
  canShowMore: boolean;
  canShowLess: boolean;
  showMore: () => void;
  showLess: () => void;
}

export function useFinancialCenter(
  transactions: readonly FinancialTransaction[],
): FinancialCenterState {
  const [selectedBanks, setSelectedBanks] = useState<ReadonlySet<BankId>>(new Set());
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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
    () => filterBySearch(filterByBanks(transactions, selectedBanks), search),
    [transactions, selectedBanks, search],
  );

  // Un filtro nuevo vuelve a arrancar desde la primera página: si no, "Cargar más"
  // seguiría en un punto que ya no corresponde a lo que se está mirando.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedBanks, search]);

  const flowTotals = useMemo(() => computeFlowTotals(filtered), [filtered]);

  // Las cuentas registradas son un catálogo de todos los bancos, no del filtro activo:
  // seleccionar "solo BCP" no debe hacer "desaparecer" las otras cuentas de la persona.
  const bankBalances = useMemo(() => computeBankBalances(transactions), [transactions]);

  // `filtered` ya viene ordenado del más reciente al más antiguo (MOCK_TRANSACTIONS lo está).
  const shown = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const movementGroups = useMemo(() => groupByDate(shown), [shown]);

  const showMore = (): void => {
    setVisibleCount((current) => Math.min(current + PAGE_SIZE, filtered.length));
  };

  const showLess = (): void => {
    setVisibleCount(PAGE_SIZE);
  };

  return {
    selectedBanks,
    toggleBank,
    selectAllBanks,
    search,
    setSearch,
    flowTotals,
    bankBalances,
    movementGroups,
    shownMovementCount: shown.length,
    totalMovementCount: filtered.length,
    canShowMore: shown.length < filtered.length,
    canShowLess: visibleCount > PAGE_SIZE,
    showMore,
    showLess,
  };
}
