import { useEffect, useMemo, useState } from 'react';

import type { BankId } from '@/features/statements/bank-selector';

import type { FinancialStatement, FinancialTransaction } from './types';

export const ALL_BANK_IDS: readonly BankId[] = ['bcp', 'bbva', 'interbank', 'scotiabank'];

/** Cuántas filas se muestran de entrada; "Cargar más" las suma de a una página. */
const PAGE_SIZE = 8;

export interface PeriodSummary {
  saldoInicial: number;
  abonos: number;
  cargos: number;
  saldoFinal: number;
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

export function filterStatementsByBanks(
  statements: readonly FinancialStatement[],
  selectedBanks: ReadonlySet<BankId>,
): FinancialStatement[] {
  if (selectedBanks.size === 0) {
    return [...statements];
  }
  return statements.filter((statement) => selectedBanks.has(statement.bancoOrigen));
}

export function filterStatementsByMonth(
  statements: readonly FinancialStatement[],
  monthKey: string,
): FinancialStatement[] {
  return statements.filter((statement) => statement.fechaPeriodo === monthKey);
}

/** Meses con al menos un EECC cargado, ordenados de más antiguo a más reciente. */
export function computeAvailableMonths(statements: readonly FinancialStatement[]): string[] {
  return Array.from(new Set(statements.map((statement) => statement.fechaPeriodo))).sort();
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

/**
 * Agrega saldo inicial, abonos, cargos y saldo final declarados en cada EECC del
 * periodo: es la ecuación de la tarjeta resumen, no un recálculo desde los
 * movimientos — así se ve exactamente lo que el estado de cuenta declara.
 */
export function computePeriodSummary(statements: readonly FinancialStatement[]): PeriodSummary {
  let saldoInicial = 0;
  let abonos = 0;
  let cargos = 0;
  let saldoFinal = 0;
  let movementCount = 0;
  let reconciledCount = 0;

  for (const statement of statements) {
    saldoInicial += statement.saldoInicial;
    abonos += statement.abonos;
    cargos += statement.cargos;
    saldoFinal += statement.saldoFinal;
    movementCount += statement.movimientos.length;
    reconciledCount += statement.movimientos.filter((movimiento) => movimiento.reconciled).length;
  }

  return { saldoInicial, abonos, cargos, saldoFinal, movementCount, reconciledCount };
}

/**
 * Un saldo por banco: el del EECC más reciente entre los cargados para ese banco,
 * no una suma de movimientos. Es el mismo criterio que declara el estado de
 * cuenta real, y no "salta" al filtrar por mes o buscar.
 */
export function computeBankBalances(statements: readonly FinancialStatement[]): BankBalance[] {
  const byBank = new Map<
    BankId,
    { balanceCents: number; movementCount: number; latestPeriod: string }
  >(
    ALL_BANK_IDS.map((bankId) => [bankId, { balanceCents: 0, movementCount: 0, latestPeriod: '' }]),
  );

  for (const statement of statements) {
    const bucket = byBank.get(statement.bancoOrigen);
    if (!bucket) {
      continue;
    }
    bucket.movementCount += statement.movimientos.length;
    if (statement.fechaPeriodo >= bucket.latestPeriod) {
      bucket.latestPeriod = statement.fechaPeriodo;
      bucket.balanceCents = statement.saldoFinal;
    }
  }

  return ALL_BANK_IDS.map((bankId) => {
    const bucket = byBank.get(bankId) ?? { balanceCents: 0, movementCount: 0, latestPeriod: '' };
    return { bankId, balanceCents: bucket.balanceCents, movementCount: bucket.movementCount };
  });
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
  calendarMonth: string;
  availableMonths: string[];
  goToMonth: (monthKey: string) => void;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  canGoPreviousMonth: boolean;
  canGoNextMonth: boolean;
  periodSummary: PeriodSummary;
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
  statements: readonly FinancialStatement[],
): FinancialCenterState {
  const [selectedBanks, setSelectedBanks] = useState<ReadonlySet<BankId>>(new Set());
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const bankFilteredStatements = useMemo(
    () => filterStatementsByBanks(statements, selectedBanks),
    [statements, selectedBanks],
  );

  const availableMonths = useMemo(
    () => computeAvailableMonths(bankFilteredStatements),
    [bankFilteredStatements],
  );

  const [calendarMonth, setCalendarMonth] = useState(() => availableMonths.at(-1) ?? '');

  // Si el filtro de banco deja fuera el mes que se estaba mirando, se salta al
  // más reciente disponible en vez de quedar mostrando un mes vacío.
  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(calendarMonth)) {
      setCalendarMonth(availableMonths.at(-1) ?? '');
    }
  }, [availableMonths, calendarMonth]);

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

  const monthIndex = availableMonths.indexOf(calendarMonth);
  const canGoPreviousMonth = monthIndex > 0;
  const canGoNextMonth = monthIndex >= 0 && monthIndex < availableMonths.length - 1;

  const goToMonth = (monthKey: string): void => {
    setCalendarMonth(monthKey);
  };

  const goToPreviousMonth = (): void => {
    if (canGoPreviousMonth) {
      setCalendarMonth(availableMonths[monthIndex - 1] ?? calendarMonth);
    }
  };

  const goToNextMonth = (): void => {
    if (canGoNextMonth) {
      setCalendarMonth(availableMonths[monthIndex + 1] ?? calendarMonth);
    }
  };

  const monthStatements = useMemo(
    () => filterStatementsByMonth(bankFilteredStatements, calendarMonth),
    [bankFilteredStatements, calendarMonth],
  );

  const periodSummary = useMemo(() => computePeriodSummary(monthStatements), [monthStatements]);

  // Las cuentas registradas son un catálogo de todos los EECC cargados, no del
  // filtro activo: seleccionar "solo BCP" no debe hacer "desaparecer" las otras
  // cuentas, y el mes elegido no cambia el saldo actual de una cuenta.
  const bankBalances = useMemo(() => computeBankBalances(statements), [statements]);

  const monthMovements = useMemo(
    () =>
      monthStatements
        .flatMap((statement) => statement.movimientos)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [monthStatements],
  );

  const filtered = useMemo(() => filterBySearch(monthMovements, search), [monthMovements, search]);

  // Un filtro nuevo vuelve a arrancar desde la primera página: si no, "Cargar más"
  // seguiría en un punto que ya no corresponde a lo que se está mirando.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedBanks, search, calendarMonth]);

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
    calendarMonth,
    availableMonths,
    goToMonth,
    goToPreviousMonth,
    goToNextMonth,
    canGoPreviousMonth,
    canGoNextMonth,
    periodSummary,
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
