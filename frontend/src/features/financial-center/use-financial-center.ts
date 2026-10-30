import { useEffect, useMemo, useState } from 'react';

import { orderBanks, type SourceBankId } from './bank-accent';
import type { Scope } from './ledger-filters';
import type { FinancialStatement, FinancialTransaction } from './types';

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
  bankId: SourceBankId;
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
  selectedBanks: ReadonlySet<SourceBankId>,
): FinancialTransaction[] {
  if (selectedBanks.size === 0) {
    return [...transactions];
  }
  return transactions.filter((transaction) => selectedBanks.has(transaction.bankId));
}

export function filterStatementsByBanks(
  statements: readonly FinancialStatement[],
  selectedBanks: ReadonlySet<SourceBankId>,
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

/** Minúsculas y sin acentos: «deposito» encuentra «Depósito». */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** `query` ya plegado con {@link foldText}. Busca en la descripción original y en la categoría. */
export function matchesSearch(transaction: FinancialTransaction, query: string): boolean {
  return (
    foldText(transaction.description).includes(query) ||
    foldText(transaction.category).includes(query)
  );
}

export function filterBySearch(
  transactions: readonly FinancialTransaction[],
  search: string,
): FinancialTransaction[] {
  const query = foldText(search.trim());
  if (!query) {
    return [...transactions];
  }
  return transactions.filter((transaction) => matchesSearch(transaction, query));
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

/** Sin otra información, todos los documentos de un banco son una sola cuenta. */
export function bankAccountKey(statement: FinancialStatement): string {
  return statement.bancoOrigen;
}

/**
 * Un saldo por banco: el del EECC más reciente de **cada cuenta** del banco, no
 * una suma de movimientos. Es el mismo criterio que declara el estado de cuenta
 * real, y no "salta" al filtrar por mes o buscar.
 *
 * Con dos cuentas del mismo banco se suman sus últimos saldos (son cuentas
 * distintas, no periodos distintos). `accountKeyOf` dice qué documento es de qué
 * cuenta; sin él, todo el banco cuenta como una.
 */
export function computeBankBalances(
  statements: readonly FinancialStatement[],
  accountKeyOf: (statement: FinancialStatement) => string = bankAccountKey,
): BankBalance[] {
  const latestByAccount = new Map<string, FinancialStatement>();
  const movementsByBank = new Map<SourceBankId, number>();

  for (const statement of statements) {
    const key = accountKeyOf(statement);
    const latest = latestByAccount.get(key);
    if (!latest || statement.fechaPeriodo >= latest.fechaPeriodo) {
      latestByAccount.set(key, statement);
    }
    movementsByBank.set(
      statement.bancoOrigen,
      (movementsByBank.get(statement.bancoOrigen) ?? 0) + statement.movimientos.length,
    );
  }

  const balanceByBank = new Map<SourceBankId, number>();
  for (const latest of latestByAccount.values()) {
    balanceByBank.set(
      latest.bancoOrigen,
      (balanceByBank.get(latest.bancoOrigen) ?? 0) + latest.saldoFinal,
    );
  }

  return orderBanks(movementsByBank.keys()).map((bankId) => ({
    bankId,
    balanceCents: balanceByBank.get(bankId) ?? 0,
    movementCount: movementsByBank.get(bankId) ?? 0,
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
  /** Mes elegido (`periodo`) o todos los documentos marcados (`acumulado`). */
  scope: Scope;
  setScope: (scope: Scope) => void;
  /** Bancos presentes en los estados de cuenta cargados, en orden de presentación. */
  banks: SourceBankId[];
  selectedBanks: ReadonlySet<SourceBankId>;
  toggleBank: (bankId: SourceBankId) => void;
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
  accountKeyOf: (statement: FinancialStatement) => string = bankAccountKey,
): FinancialCenterState {
  const [scope, setScope] = useState<Scope>('periodo');
  const [selectedBanks, setSelectedBanks] = useState<ReadonlySet<SourceBankId>>(new Set());
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

  const toggleBank = (bankId: SourceBankId): void => {
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
  const bankBalances = useMemo(
    () => computeBankBalances(statements, accountKeyOf),
    [statements, accountKeyOf],
  );

  // En acumulado, la búsqueda y la lista recorren todos los periodos marcados.
  const scopeStatements = scope === 'acumulado' ? bankFilteredStatements : monthStatements;

  const scopeMovements = useMemo(
    () =>
      scopeStatements
        .flatMap((statement) => statement.movimientos)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [scopeStatements],
  );

  const filtered = useMemo(() => filterBySearch(scopeMovements, search), [scopeMovements, search]);

  // Un filtro nuevo vuelve a arrancar desde la primera página: si no, "Cargar más"
  // seguiría en un punto que ya no corresponde a lo que se está mirando.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedBanks, search, calendarMonth, scope]);

  const shown = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const movementGroups = useMemo(() => groupByDate(shown), [shown]);

  const showMore = (): void => {
    setVisibleCount((current) => Math.min(current + PAGE_SIZE, filtered.length));
  };

  const showLess = (): void => {
    setVisibleCount(PAGE_SIZE);
  };

  return {
    scope,
    setScope,
    banks: bankBalances.map((balance) => balance.bankId),
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
