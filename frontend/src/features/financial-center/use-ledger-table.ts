import { useMemo, useState } from 'react';

import type { SourceBankId } from './bank-accent';
import type { LedgerAccount, LedgerRow } from './ledger';
import {
  CHRONOLOGICAL,
  computeSubtotals,
  computeTotals,
  filterLedgerRows,
  sortLedgerRows,
  type GroupBy,
  type LedgerTotals,
  type SortKey,
  type SortState,
  type Subtotal,
} from './ledger-filters';

/** Filas por página: suficientes para revisar, pocas para no renderizar miles. */
export const TABLE_PAGE_SIZE = 50;

/** Por importe se empieza por el mayor; por texto o fecha, en orden natural. */
const AMOUNT_KEYS: ReadonlySet<SortKey> = new Set(['cargo', 'abono', 'saldo']);

export interface LedgerTableState {
  /** Cuentas y periodos presentes en las filas del alcance, para los filtros. */
  accountOptions: LedgerAccount[];
  periodOptions: string[];
  account: string;
  setAccount: (key: string) => void;
  period: string;
  setPeriod: (month: string) => void;
  dateFrom: string;
  setDateFrom: (date: string) => void;
  dateTo: string;
  setDateTo: (date: string) => void;
  hasOwnFilters: boolean;
  clearOwnFilters: () => void;
  sort: SortState;
  toggleSort: (key: SortKey) => void;
  groupBy: GroupBy;
  setGroupBy: (groupBy: GroupBy) => void;
  pageRows: LedgerRow[];
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  firstRow: number;
  totals: LedgerTotals;
  subtotals: Subtotal[];
}

/**
 * Estado de la vista tabla. Banco y búsqueda llegan de fuera porque los
 * comparte con el panel; cuenta, periodo, fechas, orden y página son suyos.
 */
export function useLedgerTable(
  scopeRows: readonly LedgerRow[],
  banks: ReadonlySet<SourceBankId>,
  search: string,
): LedgerTableState {
  const [account, setAccountState] = useState('');
  const [period, setPeriodState] = useState('');
  const [dateFrom, setDateFromState] = useState('');
  const [dateTo, setDateToState] = useState('');
  const [sort, setSort] = useState<SortState>(CHRONOLOGICAL);
  const [groupBy, setGroupBy] = useState<GroupBy>('cuenta');
  const [page, setPage] = useState(0);

  const accountOptions = useMemo(() => {
    const seen = new Map<string, LedgerAccount>();
    for (const row of scopeRows) {
      seen.set(row.account.key, row.account);
    }
    return [...seen.values()];
  }, [scopeRows]);
  const periodOptions = useMemo(
    () => [...new Set(scopeRows.map((row) => row.statement.fechaPeriodo))].sort().reverse(),
    [scopeRows],
  );

  // Un filtro que ya no tiene sentido en el alcance actual (otra moneda, otro
  // mes) se ignora en vez de dejar la tabla vacía sin explicación.
  const activeAccount = accountOptions.some((option) => option.key === account) ? account : '';
  const activePeriod = periodOptions.includes(period) ? period : '';

  const filtered = useMemo(
    () =>
      filterLedgerRows(scopeRows, {
        banks,
        accounts: new Set(activeAccount ? [activeAccount] : []),
        periods: new Set(activePeriod ? [activePeriod] : []),
        dateFrom,
        dateTo,
        search,
      }),
    [scopeRows, banks, activeAccount, activePeriod, dateFrom, dateTo, search],
  );
  const sorted = useMemo(() => sortLedgerRows(filtered, sort), [filtered, sort]);
  const totals = useMemo(() => computeTotals(filtered), [filtered]);
  const subtotals = useMemo(() => computeSubtotals(filtered, groupBy), [filtered, groupBy]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE_SIZE));
  // Al cambiar un filtro desde fuera (banco, búsqueda) la página puede quedar
  // fuera de rango: se muestra la última que existe.
  const currentPage = Math.min(page, pageCount - 1);
  const firstRow = currentPage * TABLE_PAGE_SIZE;
  const pageRows = useMemo(
    () => sorted.slice(firstRow, firstRow + TABLE_PAGE_SIZE),
    [sorted, firstRow],
  );

  // Cada filtro propio vuelve a la primera página.
  const resetting =
    <T>(setter: (value: T) => void) =>
    (value: T): void => {
      setter(value);
      setPage(0);
    };

  return {
    accountOptions,
    periodOptions,
    account: activeAccount,
    setAccount: resetting(setAccountState),
    period: activePeriod,
    setPeriod: resetting(setPeriodState),
    dateFrom,
    setDateFrom: resetting(setDateFromState),
    dateTo,
    setDateTo: resetting(setDateToState),
    hasOwnFilters: Boolean(activeAccount || activePeriod || dateFrom || dateTo),
    clearOwnFilters: () => {
      setAccountState('');
      setPeriodState('');
      setDateFromState('');
      setDateToState('');
      setPage(0);
    },
    sort,
    toggleSort: (key) => {
      setSort((current) =>
        current.key === key
          ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
          : { key, direction: AMOUNT_KEYS.has(key) ? 'desc' : 'asc' },
      );
      setPage(0);
    },
    groupBy,
    setGroupBy,
    pageRows,
    page: currentPage,
    pageCount,
    setPage,
    firstRow,
    totals,
    subtotals,
  };
}
