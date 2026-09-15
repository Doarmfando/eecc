import { useMemo, useState } from 'react';

import { filterByBanks } from '@/features/financial-center/use-financial-center';
import type { FinancialTransaction } from '@/features/financial-center/types';
import type { BankId } from '@/features/statements/bank-selector';

import { daysInMonth } from './calendar-grid';

export type ViewMode = 'flujo' | 'balance';

export interface DailyFlow {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  count: number;
}

export interface MonthSummary {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  closingBalanceCents: number;
  movementCount: number;
}

export function filterByMonth(
  transactions: readonly FinancialTransaction[],
  monthKey: string,
): FinancialTransaction[] {
  return transactions.filter((transaction) => transaction.date.slice(0, 7) === monthKey);
}

export function filterByDate(
  transactions: readonly FinancialTransaction[],
  date: string,
): FinancialTransaction[] {
  return transactions.filter((transaction) => transaction.date === date);
}

export function computeDailyFlows(
  transactions: readonly FinancialTransaction[],
): Map<string, DailyFlow> {
  const byDate = new Map<string, DailyFlow>();
  for (const transaction of transactions) {
    const flow = byDate.get(transaction.date) ?? {
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      count: 0,
    };
    if (transaction.type === 'ABONO') {
      flow.incomeCents += transaction.amountCents;
      flow.netCents += transaction.amountCents;
    } else {
      flow.expenseCents += transaction.amountCents;
      flow.netCents -= transaction.amountCents;
    }
    flow.count += 1;
    byDate.set(transaction.date, flow);
  }
  return byDate;
}

/** Saldo acumulado justo antes del mes: lo que arrastra el calendario al abrir ese mes. */
export function computeBalanceBeforeMonth(
  transactions: readonly FinancialTransaction[],
  monthKey: string,
): number {
  let balance = 0;
  for (const transaction of transactions) {
    if (transaction.date.slice(0, 7) >= monthKey) {
      continue;
    }
    balance += transaction.type === 'ABONO' ? transaction.amountCents : -transaction.amountCents;
  }
  return balance;
}

/** Saldo de cierre para cada día del mes, arrastrando el de la víspera cuando no hubo movimientos. */
export function computeMonthlyBalances(
  monthKey: string,
  balanceBeforeMonth: number,
  dailyFlows: ReadonlyMap<string, DailyFlow>,
): Map<string, number> {
  const total = daysInMonth(monthKey);
  const balances = new Map<string, number>();
  let running = balanceBeforeMonth;
  for (let day = 1; day <= total; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, '0')}`;
    running += dailyFlows.get(date)?.netCents ?? 0;
    balances.set(date, running);
  }
  return balances;
}

export function computeMonthSummary(
  monthTransactions: readonly FinancialTransaction[],
  balanceBeforeMonth: number,
): MonthSummary {
  let incomeCents = 0;
  let expenseCents = 0;

  for (const transaction of monthTransactions) {
    if (transaction.type === 'ABONO') {
      incomeCents += transaction.amountCents;
    } else {
      expenseCents += transaction.amountCents;
    }
  }

  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    closingBalanceCents: balanceBeforeMonth + incomeCents - expenseCents,
    movementCount: monthTransactions.length,
  };
}

export interface FinancialCalendarState {
  selectedBanks: ReadonlySet<BankId>;
  toggleBank: (bankId: BankId) => void;
  selectAllBanks: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  calendarMonth: string;
  goToMonth: (monthKey: string) => void;
  selectedDate: string | null;
  selectDate: (date: string) => void;
  clearSelectedDate: () => void;
  dailyFlows: Map<string, DailyFlow>;
  monthlyBalances: Map<string, number>;
  monthSummary: MonthSummary;
  dayTransactions: FinancialTransaction[];
}

export function useFinancialCalendar(
  transactions: readonly FinancialTransaction[],
  initialMonth: string,
): FinancialCalendarState {
  const [selectedBanks, setSelectedBanks] = useState<ReadonlySet<BankId>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('flujo');
  const [calendarMonth, setCalendarMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

  const goToMonth = (monthKey: string): void => {
    setCalendarMonth(monthKey);
    setSelectedDate(null);
  };

  const selectDate = (date: string): void => {
    setSelectedDate((current) => (current === date ? null : date));
  };

  const clearSelectedDate = (): void => {
    setSelectedDate(null);
  };

  const bankFiltered = useMemo(
    () => filterByBanks(transactions, selectedBanks),
    [transactions, selectedBanks],
  );

  const monthTransactions = useMemo(
    () => filterByMonth(bankFiltered, calendarMonth),
    [bankFiltered, calendarMonth],
  );

  const dailyFlows = useMemo(() => computeDailyFlows(monthTransactions), [monthTransactions]);

  const balanceBeforeMonth = useMemo(
    () => computeBalanceBeforeMonth(bankFiltered, calendarMonth),
    [bankFiltered, calendarMonth],
  );

  const monthlyBalances = useMemo(
    () => computeMonthlyBalances(calendarMonth, balanceBeforeMonth, dailyFlows),
    [calendarMonth, balanceBeforeMonth, dailyFlows],
  );

  const monthSummary = useMemo(
    () => computeMonthSummary(monthTransactions, balanceBeforeMonth),
    [monthTransactions, balanceBeforeMonth],
  );

  const dayTransactions = useMemo(
    () => (selectedDate ? filterByDate(bankFiltered, selectedDate) : []),
    [bankFiltered, selectedDate],
  );

  return {
    selectedBanks,
    toggleBank,
    selectAllBanks,
    viewMode,
    setViewMode,
    calendarMonth,
    goToMonth,
    selectedDate,
    selectDate,
    clearSelectedDate,
    dailyFlows,
    monthlyBalances,
    monthSummary,
    dayTransactions,
  };
}
