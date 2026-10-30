import { normalizeHeader, readCell, readCsvTable } from '@/lib/csv';

import type { DeclaredPeriod, StatementAccount } from './types';

/**
 * Lectura mínima de la hoja `Encabezado` (pares `Campo`/`Valor`, ADR-0015).
 *
 * La hoja trae titular, documento de identidad y dirección: aquí no se leen. De
 * la cuenta se queda una huella y sus cuatro últimos caracteres; el número
 * completo no sale de esta función.
 */

export interface AccountHeader {
  cuenta: StatementAccount | null;
  periodo: DeclaredPeriod | null;
}

const EMPTY: AccountHeader = { cuenta: null, periodo: null };

/**
 * Rótulos con que cada banco nombra la cuenta: `Número de cuenta` (Interbank,
 * Banco de la Nación) o `Código de cuenta` (BCP, BBVA). El CCI no: es otro número.
 */
const ACCOUNT_FIELDS = ['Número de cuenta', 'Código de cuenta'] as const;

/** Menos que esto no distingue una cuenta de otra. */
const MIN_ACCOUNT_LENGTH = 6;

/** FNV-1a de 32 bits: basta para distinguir cuentas, y no es reversible a la vista. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function readAccount(raw: string): StatementAccount | null {
  const normalized = raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (normalized.length < MIN_ACCOUNT_LENGTH) {
    return null;
  }
  return { clave: fingerprint(normalized), terminacion: normalized.slice(-4) };
}

const DATE = /(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g;

function toIsoDate(day: string, month: string, year: string): string | null {
  const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const parsed = new Date(Date.UTC(fullYear, monthNumber - 1, dayNumber));
  if (
    parsed.getUTCFullYear() !== fullYear ||
    parsed.getUTCMonth() !== monthNumber - 1 ||
    parsed.getUTCDate() !== dayNumber
  ) {
    return null;
  }
  return `${String(fullYear)}-${String(monthNumber).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
}

function datesIn(text: string): string[] {
  return [...text.matchAll(DATE)].flatMap(([, day = '', month = '', year = '']) => {
    const iso = toIsoDate(day, month, year);
    return iso ? [iso] : [];
  });
}

/**
 * `Fecha inicio` y `Fecha fin` cuando el banco las separa (BCP); si no, las dos
 * fechas del texto de `Periodo` (`DEL 31/12/25 AL 31/01/26`). Un periodo que no
 * se entiende queda en `null`: el mes se sigue deduciendo de los movimientos.
 */
export function readPeriod(start: string, end: string, label: string): DeclaredPeriod | null {
  const [from, to] = [datesIn(start)[0], datesIn(end)[0]];
  const candidates = from && to ? [from, to] : datesIn(label);
  const [first, second] = candidates;
  if (!first || !second || candidates.length !== 2 || first > second) {
    return null;
  }
  return { start: first, end: second };
}

export function readAccountHeader(csv: string | null): AccountHeader {
  if (!csv) {
    return EMPTY;
  }
  const table = readCsvTable(csv);
  const fields = new Map<string, string>();
  for (const row of table.rows) {
    const field = normalizeHeader(readCell(table, row, 'Campo'));
    if (field && !fields.has(field)) {
      fields.set(field, readCell(table, row, 'Valor').trim());
    }
  }
  const value = (label: string): string => fields.get(normalizeHeader(label)) ?? '';

  const accountRaw = ACCOUNT_FIELDS.map(value).find(Boolean) ?? '';
  return {
    cuenta: readAccount(accountRaw),
    periodo: readPeriod(value('Fecha inicio'), value('Fecha fin'), value('Periodo')),
  };
}
