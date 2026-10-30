import { BANK_ACCENTS, type SourceBankId } from './bank-accent';
import { compareChronologically, type LedgerRow } from './ledger';
import { foldText, matchesSearch } from './use-financial-center';

/**
 * Lo que se le pregunta a los movimientos anexados: alcance, filtros, orden y
 * totales. Funciones puras: el panel, la tabla y sus pruebas usan las mismas.
 */

/** `periodo`: el mes elegido. `acumulado`: todos los documentos marcados. */
export type Scope = 'periodo' | 'acumulado';

/**
 * En `periodo` cuenta el mes **del documento**, no el de la fecha del movimiento:
 * un cargo del 31 de diciembre impreso en el estado de cuenta de enero es de enero.
 */
export function rowsInScope(rows: readonly LedgerRow[], scope: Scope, month: string): LedgerRow[] {
  return scope === 'acumulado'
    ? [...rows]
    : rows.filter((row) => row.statement.fechaPeriodo === month);
}

export interface LedgerFilters {
  /** Vacío: todos los bancos. */
  banks: ReadonlySet<SourceBankId>;
  /** Claves de cuenta; vacío: todas. */
  accounts: ReadonlySet<string>;
  /** Meses de documento; vacío: todos. */
  periods: ReadonlySet<string>;
  /** Fechas ISO del movimiento, inclusivas; vacío: sin límite. */
  dateFrom: string;
  dateTo: string;
  search: string;
}

export const NO_FILTERS: LedgerFilters = {
  banks: new Set(),
  accounts: new Set(),
  periods: new Set(),
  dateFrom: '',
  dateTo: '',
  search: '',
};

export function filterLedgerRows(rows: readonly LedgerRow[], filters: LedgerFilters): LedgerRow[] {
  const query = foldText(filters.search.trim());
  return rows.filter((row) => {
    const { transaction, statement, account } = row;
    if (filters.banks.size > 0 && !filters.banks.has(statement.bancoOrigen)) {
      return false;
    }
    if (filters.accounts.size > 0 && !filters.accounts.has(account.key)) {
      return false;
    }
    if (filters.periods.size > 0 && !filters.periods.has(statement.fechaPeriodo)) {
      return false;
    }
    // Con un rango de fechas, un movimiento sin fecha legible no está en él.
    if (filters.dateFrom && !(transaction.date && transaction.date >= filters.dateFrom)) {
      return false;
    }
    if (filters.dateTo && !(transaction.date && transaction.date <= filters.dateTo)) {
      return false;
    }
    return !query || matchesSearch(transaction, query);
  });
}

export type SortKey =
  | 'fecha'
  | 'periodo'
  | 'banco'
  | 'cuenta'
  | 'descripcion'
  | 'categoria'
  | 'cargo'
  | 'abono'
  | 'saldo'
  | 'documento';

export interface SortState {
  key: SortKey;
  direction: 'asc' | 'desc';
}

export const CHRONOLOGICAL: SortState = { key: 'fecha', direction: 'asc' };

const collator = new Intl.Collator('es-PE', { sensitivity: 'base', numeric: true });

function compareBy(key: SortKey, a: LedgerRow, b: LedgerRow): number {
  switch (key) {
    case 'fecha':
      return 0;
    case 'periodo':
      return a.statement.fechaPeriodo.localeCompare(b.statement.fechaPeriodo);
    case 'banco':
      return collator.compare(
        BANK_ACCENTS[a.statement.bancoOrigen].name,
        BANK_ACCENTS[b.statement.bancoOrigen].name,
      );
    case 'cuenta':
      return collator.compare(a.account.terminacion ?? '', b.account.terminacion ?? '');
    case 'descripcion':
      return collator.compare(a.transaction.description, b.transaction.description);
    case 'categoria':
      return collator.compare(a.transaction.category, b.transaction.category);
    case 'cargo':
      return a.transaction.debitCents - b.transaction.debitCents;
    case 'abono':
      return a.transaction.creditCents - b.transaction.creditCents;
    case 'saldo':
      // Sin saldo impreso va siempre al final, en cualquier dirección.
      return (
        (a.transaction.balanceCents ?? Number.NEGATIVE_INFINITY) -
        (b.transaction.balanceCents ?? Number.NEGATIVE_INFINITY)
      );
    case 'documento':
      return collator.compare(a.statement.nombreDocumento ?? '', b.statement.nombreDocumento ?? '');
  }
}

/** Ordena por la columna y, a igualdad, cronológicamente: el orden nunca es arbitrario. */
export function sortLedgerRows(rows: readonly LedgerRow[], sort: SortState): LedgerRow[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort(
    (a, b) => sign * (compareBy(sort.key, a, b) || compareChronologically(a, b)),
  );
}

export interface LedgerTotals {
  count: number;
  debitCents: number;
  creditCents: number;
  /** Abonos menos cargos. Es un flujo, no un saldo. */
  netCents: number;
}

export function computeTotals(rows: readonly LedgerRow[]): LedgerTotals {
  let debitCents = 0;
  let creditCents = 0;
  for (const { transaction } of rows) {
    debitCents += transaction.debitCents;
    creditCents += transaction.creditCents;
  }
  return { count: rows.length, debitCents, creditCents, netCents: creditCents - debitCents };
}

export type GroupBy = 'banco' | 'cuenta' | 'periodo';

export interface Subtotal extends LedgerTotals {
  key: string;
  /** La fila que representa al grupo: de ahí la vista saca banco, cuenta o periodo. */
  sample: LedgerRow;
}

function groupKey(row: LedgerRow, by: GroupBy): string {
  switch (by) {
    case 'banco':
      return row.statement.bancoOrigen;
    case 'cuenta':
      return row.account.key;
    case 'periodo':
      return row.statement.fechaPeriodo;
  }
}

/** Subtotales de flujo por grupo, en el orden en que aparecen las filas. */
export function computeSubtotals(rows: readonly LedgerRow[], by: GroupBy): Subtotal[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const key = groupKey(row, by);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }
  const subtotals = [...groups.entries()].map(([key, group]) => ({
    key,
    sample: group[0] as LedgerRow,
    ...computeTotals(group),
  }));
  return by === 'periodo' ? subtotals.sort((a, b) => a.key.localeCompare(b.key)) : subtotals;
}
