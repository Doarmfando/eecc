import type { Currency } from '@/lib/format';
import { shiftMonth } from '@/lib/month';

import { orderBanks, type SourceBankId } from './bank-accent';
import type { FinancialStatement, FinancialTransaction } from './types';

/**
 * Consolidación de los estados de cuenta marcados en el Historial: lo que en
 * Power Query sería «anexar consultas», pero sin concatenar a ciegas.
 *
 * Cada documento ya llega normalizado (`statement-from-csv.ts`). Aquí se decide
 * a qué cuenta pertenece, se apartan las copias exactas, se encadenan los
 * periodos de cada cuenta y se anexan sus movimientos en una sola lista. Las
 * vistas (panel, tabla, calendario) leen de aquí; ninguna repite estas reglas.
 *
 * Reglas que no se negocian:
 * - una cuenta es banco + moneda + número; dos cuentas del mismo banco no se mezclan;
 * - los saldos de periodos distintos nunca se suman: se toman de la cadena;
 * - una cadena con huecos, superposiciones o saltos de saldo no da un saldo confiable;
 * - solo se aparta un documento si es copia exacta de otro; lo dudoso se señala.
 */

export interface LedgerAccount {
  key: string;
  bankId: SourceBankId;
  currency: Currency;
  /** Últimos caracteres del número de cuenta; `null` si no se pudo identificar. */
  terminacion: string | null;
  /**
   * `true` cuando algún documento del banco no declara su cuenta: entonces no se
   * puede saber qué documento es de qué cuenta y se agrupan todos por banco.
   */
  porBanco: boolean;
  /** Del periodo más antiguo al más reciente. */
  statements: FinancialStatement[];
  primerPeriodo: string;
  ultimoPeriodo: string;
  /** El que declara el documento más antiguo de la cadena. */
  saldoInicial: number;
  /** El que declara el documento más reciente de la cadena. */
  saldoFinal: number;
  abonos: number;
  cargos: number;
  /** Sin huecos, sin superposiciones y con cada saldo inicial igual al final anterior. */
  continua: boolean;
}

export type LedgerIssue =
  | { kind: 'DOCUMENTO_DUPLICADO'; statementId: string; duplicateOf: string }
  | { kind: 'PERIODO_SUPERPUESTO'; accountKey: string; statementIds: readonly [string, string] }
  | { kind: 'PERIODOS_FALTANTES'; accountKey: string; months: readonly string[] }
  | {
      kind: 'SALDO_DISCONTINUO';
      accountKey: string;
      statementIds: readonly [string, string];
      expectedCents: number;
      foundCents: number;
    }
  | { kind: 'REQUIERE_REVISION'; statementId: string }
  | { kind: 'MONEDA_SUPUESTA'; statementId: string }
  | { kind: 'CUENTA_NO_IDENTIFICADA'; statementId: string }
  | { kind: 'FECHAS_ANTERIORES_AL_ARREGLO'; statementId: string }
  | { kind: 'MOVIMIENTOS_INCONSISTENTES'; statementId: string; count: number };

/** Un movimiento anexado, con todo lo que hace falta para rastrearlo hasta su fila. */
export interface LedgerRow {
  transaction: FinancialTransaction;
  statement: FinancialStatement;
  account: LedgerAccount;
  /**
   * Aparece igual (fecha, cargo, abono y saldo impreso) en otro documento de la
   * misma cuenta cuyo periodo se superpone. Se señala; no se quita.
   */
  possibleRepeat: boolean;
}

export interface Ledger {
  /** Los documentos que se consolidan, en el orden en que llegaron. */
  statements: FinancialStatement[];
  /** Copias exactas apartadas, con el documento que sí se conserva. */
  excluded: { statement: FinancialStatement; duplicateOf: FinancialStatement }[];
  accounts: LedgerAccount[];
  issues: LedgerIssue[];
  /** Todos los movimientos, en orden cronológico. */
  rows: LedgerRow[];
  accountOf: (statementId: string) => LedgerAccount | undefined;
}

/**
 * Versiones que todavía fechaban un `31DIC` sin año con el año del cierre
 * (corregido en el worker con BCP 0.5.3 y Banco de la Nación 0.4.1).
 */
const YEAR_FIX_VERSIONS: Partial<Record<SourceBankId, readonly number[]>> = {
  bcp: [0, 5, 3],
  nacion: [0, 4, 1],
};

function parseVersion(version: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

export function predatesYearFix(statement: FinancialStatement): boolean {
  const fixed = YEAR_FIX_VERSIONS[statement.bancoOrigen];
  const version = statement.versionExtractor ? parseVersion(statement.versionExtractor) : null;
  if (!fixed || !version) {
    return false;
  }
  for (let index = 0; index < fixed.length; index += 1) {
    const difference = (version[index] ?? 0) - (fixed[index] ?? 0);
    if (difference !== 0) {
      return difference < 0;
    }
  }
  return false;
}

/** Todo lo que vuelve idéntico a un documento, sin su identificador ni su nombre. */
function contentSignature(statement: FinancialStatement): string {
  return JSON.stringify([
    statement.bancoOrigen,
    statement.moneda,
    statement.cuenta?.clave ?? null,
    statement.fechaPeriodo,
    statement.periodoDeclarado,
    statement.saldoInicial,
    statement.saldoFinal,
    statement.abonos,
    statement.cargos,
    statement.movimientos.map((movement) => [
      movement.date,
      movement.debitCents,
      movement.creditCents,
      movement.balanceCents,
      movement.description,
    ]),
  ]);
}

/** Un mismo PDF convertido dos veces: se queda el primero, que es el más reciente del historial. */
function separateExactCopies(statements: readonly FinancialStatement[]): {
  kept: FinancialStatement[];
  excluded: Ledger['excluded'];
} {
  const bySignature = new Map<string, FinancialStatement>();
  const kept: FinancialStatement[] = [];
  const excluded: Ledger['excluded'] = [];
  for (const statement of statements) {
    const signature = contentSignature(statement);
    const original = bySignature.get(signature);
    if (original) {
      excluded.push({ statement, duplicateOf: original });
    } else {
      bySignature.set(signature, statement);
      kept.push(statement);
    }
  }
  return { kept, excluded };
}

/** Dónde empieza el documento, para ordenar la cadena: el periodo declarado manda. */
function chainStart(statement: FinancialStatement): string {
  return statement.periodoDeclarado?.start ?? `${statement.fechaPeriodo}-00`;
}

function compareStatements(a: FinancialStatement, b: FinancialStatement): number {
  return (
    chainStart(a).localeCompare(chainStart(b)) ||
    a.fechaPeriodo.localeCompare(b.fechaPeriodo) ||
    a.id.localeCompare(b.id)
  );
}

function overlaps(previous: FinancialStatement, next: FinancialStatement): boolean {
  const [a, b] = [previous.periodoDeclarado, next.periodoDeclarado];
  if (a && b) {
    // Compartir el día de corte (`… AL 31/01` y `DEL 31/01 …`) es lo normal en BCP.
    return b.start < a.end;
  }
  return previous.fechaPeriodo === next.fechaPeriodo;
}

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = shiftMonth(from, 1); month < to; month = shiftMonth(month, 1)) {
    months.push(month);
  }
  return months;
}

/**
 * A qué cuenta va cada documento. Si todos los del banco (en esa moneda) dicen
 * su número, uno por cuenta; si alguno no lo dice, todos van juntos por banco,
 * como antes: separar solo a los identificados duplicaría saldos iniciales.
 */
function accountKeys(statements: readonly FinancialStatement[]): Map<string, string> {
  const byBank = new Map<string, FinancialStatement[]>();
  for (const statement of statements) {
    const bankKey = `${statement.bancoOrigen}:${statement.moneda}`;
    byBank.set(bankKey, [...(byBank.get(bankKey) ?? []), statement]);
  }
  const keys = new Map<string, string>();
  for (const [bankKey, group] of byBank) {
    const identified = group.every((statement) => statement.cuenta !== null);
    for (const statement of group) {
      keys.set(
        statement.id,
        identified && statement.cuenta ? `${bankKey}:${statement.cuenta.clave}` : `${bankKey}:*`,
      );
    }
  }
  return keys;
}

function buildAccount(
  key: string,
  group: FinancialStatement[],
  issues: LedgerIssue[],
  repeats: Set<string>,
): LedgerAccount {
  const statements = [...group].sort(compareStatements);
  const first = statements[0] as FinancialStatement;
  const last = statements.at(-1) as FinancialStatement;
  let continua = true;

  for (let index = 1; index < statements.length; index += 1) {
    const previous = statements[index - 1] as FinancialStatement;
    const next = statements[index] as FinancialStatement;
    if (overlaps(previous, next)) {
      continua = false;
      issues.push({
        kind: 'PERIODO_SUPERPUESTO',
        accountKey: key,
        statementIds: [previous.id, next.id],
      });
      markRepeats(previous, next, repeats);
      continue;
    }
    const missing = monthsBetween(previous.fechaPeriodo, next.fechaPeriodo);
    if (missing.length > 0) {
      continua = false;
      issues.push({ kind: 'PERIODOS_FALTANTES', accountKey: key, months: missing });
    }
    if (next.saldoInicial !== previous.saldoFinal) {
      continua = false;
      issues.push({
        kind: 'SALDO_DISCONTINUO',
        accountKey: key,
        statementIds: [previous.id, next.id],
        expectedCents: previous.saldoFinal,
        foundCents: next.saldoInicial,
      });
    }
  }

  return {
    key,
    bankId: first.bancoOrigen,
    currency: first.moneda,
    terminacion: key.endsWith(':*') ? null : (first.cuenta?.terminacion ?? null),
    porBanco: key.endsWith(':*'),
    statements,
    primerPeriodo: first.fechaPeriodo,
    ultimoPeriodo: last.fechaPeriodo,
    saldoInicial: first.saldoInicial,
    saldoFinal: last.saldoFinal,
    abonos: statements.reduce((total, statement) => total + statement.abonos, 0),
    cargos: statements.reduce((total, statement) => total + statement.cargos, 0),
    continua,
  };
}

/**
 * En dos documentos superpuestos de la misma cuenta, un movimiento con la misma
 * fecha, importes y saldo impreso es casi seguro el mismo. Sin saldo impreso no
 * hay forma de distinguirlo de dos pagos iguales el mismo día: no se marca.
 */
function markRepeats(a: FinancialStatement, b: FinancialStatement, repeats: Set<string>): void {
  const keyOf = (movement: FinancialTransaction): string | null =>
    movement.balanceCents === null
      ? null
      : [movement.date, movement.debitCents, movement.creditCents, movement.balanceCents].join('|');
  const inA = new Map<string, string[]>();
  for (const movement of a.movimientos) {
    const key = keyOf(movement);
    if (key) {
      inA.set(key, [...(inA.get(key) ?? []), movement.id]);
    }
  }
  for (const movement of b.movimientos) {
    const key = keyOf(movement);
    const matches = key ? inA.get(key) : undefined;
    if (matches) {
      repeats.add(movement.id);
      matches.forEach((id) => repeats.add(id));
    }
  }
}

function statementIssues(statement: FinancialStatement): LedgerIssue[] {
  const issues: LedgerIssue[] = [];
  if (statement.estado === 'NEEDS_REVIEW') {
    issues.push({ kind: 'REQUIERE_REVISION', statementId: statement.id });
  }
  if (!statement.monedaDeclarada) {
    issues.push({ kind: 'MONEDA_SUPUESTA', statementId: statement.id });
  }
  if (statement.cuenta === null) {
    issues.push({ kind: 'CUENTA_NO_IDENTIFICADA', statementId: statement.id });
  }
  if (predatesYearFix(statement)) {
    issues.push({ kind: 'FECHAS_ANTERIORES_AL_ARREGLO', statementId: statement.id });
  }
  const inconsistent = statement.movimientos.filter((movement) => movement.issues.length > 0);
  if (inconsistent.length > 0) {
    issues.push({
      kind: 'MOVIMIENTOS_INCONSISTENTES',
      statementId: statement.id,
      count: inconsistent.length,
    });
  }
  return issues;
}

/** Fecha, luego periodo del documento, documento y fila original: el orden del banco. */
export function compareChronologically(a: LedgerRow, b: LedgerRow): number {
  // Una fila sin fecha legible va al final, no al principio.
  const dateA = a.transaction.date || '9999';
  const dateB = b.transaction.date || '9999';
  return (
    dateA.localeCompare(dateB) ||
    a.statement.fechaPeriodo.localeCompare(b.statement.fechaPeriodo) ||
    a.statement.id.localeCompare(b.statement.id) ||
    a.transaction.source.row - b.transaction.source.row ||
    a.transaction.id.localeCompare(b.transaction.id)
  );
}

export function buildLedger(input: readonly FinancialStatement[]): Ledger {
  const { kept, excluded } = separateExactCopies(input);
  const issues: LedgerIssue[] = excluded.map(({ statement, duplicateOf }) => ({
    kind: 'DOCUMENTO_DUPLICADO',
    statementId: statement.id,
    duplicateOf: duplicateOf.id,
  }));
  for (const statement of kept) {
    issues.push(...statementIssues(statement));
  }

  const keys = accountKeys(kept);
  const groups = new Map<string, FinancialStatement[]>();
  for (const statement of kept) {
    const key = keys.get(statement.id) ?? '';
    groups.set(key, [...(groups.get(key) ?? []), statement]);
  }

  const repeats = new Set<string>();
  const bankOrder = orderBanks(kept.map((statement) => statement.bancoOrigen));
  const accounts = [...groups.entries()]
    .map(([key, group]) => buildAccount(key, group, issues, repeats))
    .sort(
      (a, b) =>
        bankOrder.indexOf(a.bankId) - bankOrder.indexOf(b.bankId) ||
        a.currency.localeCompare(b.currency) ||
        (a.terminacion ?? '').localeCompare(b.terminacion ?? ''),
    );

  const byStatement = new Map<string, LedgerAccount>();
  for (const account of accounts) {
    for (const statement of account.statements) {
      byStatement.set(statement.id, account);
    }
  }

  const rows: LedgerRow[] = kept.flatMap((statement) => {
    const account = byStatement.get(statement.id) as LedgerAccount;
    return statement.movimientos.map((transaction) => ({
      transaction,
      statement,
      account,
      possibleRepeat: repeats.has(transaction.id),
    }));
  });
  rows.sort(compareChronologically);

  return {
    statements: kept,
    excluded,
    accounts,
    issues,
    rows,
    accountOf: (statementId) => byStatement.get(statementId),
  };
}

/** Las cuentas que deja ver el filtro de bancos; vacío es «todos». */
export function accountsForBanks(
  accounts: readonly LedgerAccount[],
  selectedBanks: ReadonlySet<SourceBankId>,
): LedgerAccount[] {
  return selectedBanks.size === 0
    ? [...accounts]
    : accounts.filter((account) => selectedBanks.has(account.bankId));
}

/**
 * Saldo de varias cuentas a la vez. Solo es un número real si todas sus cadenas
 * están completas y abarcan los mismos meses; si no, sumarlas mezclaría saldos
 * de fechas distintas y no sería el de ningún momento.
 */
export type ConsolidatedBalance =
  | { kind: 'CONCILIADO'; saldoInicial: number; saldoFinal: number; desde: string; hasta: string }
  | { kind: 'SIN_SALDO'; motivo: 'CADENA_INCOMPLETA' | 'PERIODOS_DISTINTOS' | 'SIN_CUENTAS' };

export function consolidatedBalance(accounts: readonly LedgerAccount[]): ConsolidatedBalance {
  const [first] = accounts;
  if (!first) {
    return { kind: 'SIN_SALDO', motivo: 'SIN_CUENTAS' };
  }
  if (accounts.some((account) => !account.continua)) {
    return { kind: 'SIN_SALDO', motivo: 'CADENA_INCOMPLETA' };
  }
  const sameRange = accounts.every(
    (account) =>
      account.primerPeriodo === first.primerPeriodo &&
      account.ultimoPeriodo === first.ultimoPeriodo,
  );
  if (!sameRange) {
    return { kind: 'SIN_SALDO', motivo: 'PERIODOS_DISTINTOS' };
  }
  return {
    kind: 'CONCILIADO',
    saldoInicial: accounts.reduce((total, account) => total + account.saldoInicial, 0),
    saldoFinal: accounts.reduce((total, account) => total + account.saldoFinal, 0),
    desde: first.primerPeriodo,
    hasta: first.ultimoPeriodo,
  };
}
