import { formatMoney } from '@/lib/format';
import { getMonthLabel } from '@/lib/month';

import { BANK_ACCENTS } from './bank-accent';
import type { Ledger, LedgerAccount, LedgerIssue } from './ledger';
import type { DateKind, FinancialStatement, MovementIssue } from './types';

/** «BCP ···2345», o «BCP · cuenta sin identificar». Nunca el número completo. */
export function accountLabel(account: LedgerAccount): string {
  const bank = BANK_ACCENTS[account.bankId].name;
  return account.terminacion
    ? `${bank} ···${account.terminacion}`
    : `${bank} · cuenta sin identificar`;
}

/** El nombre del PDF; sin él, banco y mes, que es como se reconoce en el Historial. */
export function documentLabel(statement: FinancialStatement): string {
  return (
    statement.nombreDocumento ??
    `${BANK_ACCENTS[statement.bancoOrigen].name} · ${statement.periodoLabel}`
  );
}

export const DATE_KIND_LABELS: Record<DateKind, string> = {
  PROCESO: 'Fecha de proceso',
  OPERACION: 'Fecha de operación',
  NO_DECLARADA: 'Fecha que imprime el banco',
};

export const MOVEMENT_ISSUE_LABELS: Record<MovementIssue, string> = {
  SIGNO_INCONSISTENTE: 'El importe con signo no coincide con las columnas Cargo y Abono',
  IMPORTE_NEGATIVO: 'El banco imprimió el importe con signo; se muestra su valor absoluto',
};

function formatMonths(months: readonly string[]): string {
  return months.map(getMonthLabel).join(', ');
}

/**
 * Un aviso en palabras para quien revisa sus cuentas, sin jerga del sistema.
 * `severity` separa lo que afecta a los números (`warning`) de lo informativo.
 */
export function describeIssue(
  issue: LedgerIssue,
  ledger: Pick<Ledger, 'accounts' | 'statements' | 'excluded'>,
): { severity: 'warning' | 'info'; text: string } {
  const statements = new Map<string, FinancialStatement>();
  for (const statement of ledger.statements) {
    statements.set(statement.id, statement);
  }
  for (const { statement } of ledger.excluded) {
    statements.set(statement.id, statement);
  }
  const doc = (id: string): string => {
    const statement = statements.get(id);
    return statement ? `«${documentLabel(statement)}»` : 'un documento';
  };
  const account = (key: string): string => {
    const found = ledger.accounts.find((candidate) => candidate.key === key);
    return found ? accountLabel(found) : 'Una cuenta';
  };
  const money = (cents: number, id: string): string =>
    formatMoney(cents, statements.get(id)?.moneda ?? 'PEN');

  switch (issue.kind) {
    case 'DOCUMENTO_DUPLICADO':
      return {
        severity: 'info',
        text: `${doc(issue.statementId)} es una copia exacta de ${doc(issue.duplicateOf)}: se cuenta una sola vez.`,
      };
    case 'PERIODO_SUPERPUESTO':
      return {
        severity: 'warning',
        text: `${account(issue.accountKey)}: ${doc(issue.statementIds[0])} y ${doc(issue.statementIds[1])} cubren el mismo periodo. Si es el mismo estado de cuenta, desmarca uno en el Historial; los movimientos que coinciden se marcan como posible repetición.`,
      };
    case 'PERIODOS_FALTANTES':
      return {
        severity: 'warning',
        text: `${account(issue.accountKey)}: falta ${formatMonths(issue.months)}. Su saldo acumulado no es confiable.`,
      };
    case 'SALDO_DISCONTINUO':
      return {
        severity: 'warning',
        text: `${account(issue.accountKey)}: ${doc(issue.statementIds[1])} empieza con ${money(issue.foundCents, issue.statementIds[1])}, pero ${doc(issue.statementIds[0])} terminó con ${money(issue.expectedCents, issue.statementIds[0])}.`,
      };
    case 'REQUIERE_REVISION':
      return {
        severity: 'warning',
        text: `${doc(issue.statementId)} quedó en «Requiere revisión»: sus totales no cuadran del todo con los movimientos.`,
      };
    case 'MONEDA_SUPUESTA':
      return {
        severity: 'info',
        text: `${doc(issue.statementId)} no declara su moneda; se muestra en soles.`,
      };
    case 'CUENTA_NO_IDENTIFICADA':
      return {
        severity: 'info',
        text: `${doc(issue.statementId)} no identifica su número de cuenta; sus movimientos se agrupan por banco.`,
      };
    case 'FECHAS_ANTERIORES_AL_ARREGLO':
      return {
        severity: 'warning',
        text: `${doc(issue.statementId)} se convirtió antes del arreglo de fechas sin año: un movimiento de fin de año puede figurar en el año equivocado. Vuelve a subirlo.`,
      };
    case 'MOVIMIENTOS_INCONSISTENTES':
      return {
        severity: 'warning',
        text: `${doc(issue.statementId)}: ${String(issue.count)} ${issue.count === 1 ? 'movimiento tiene' : 'movimientos tienen'} importes que no cuadran entre columnas.`,
      };
  }
}
