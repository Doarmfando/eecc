import type { ReactNode } from 'react';

import type { Check } from '@/types/job';

/**
 * Los códigos se muestran con su explicación. No se traduce a un mensaje único
 * porque el operador necesita saber exactamente qué invariante falló.
 */
const WARNING_LABELS: Record<string, string> = {
  BCP_AMOUNT_UNPARSEABLE: 'Un importe no pudo interpretarse con certeza.',
  BCP_NEGATIVE_COLUMN_AMOUNT: 'Se encontró un importe negativo en una columna que no lo admite.',
  BCP_BOTH_DEBIT_AND_CREDIT: 'Una fila trae cargo y abono a la vez.',
  BCP_INVALID_DATE: 'Una fila tiene fecha inválida y quedó sin clasificar.',
  BCP_CONTINUATION_CONFLICT: 'Una continuación entraba en conflicto con el movimiento anterior.',
  BCP_DECLARED_TOTAL_MISMATCH:
    'Un total impreso en el documento no cuadra con la suma de sus movimientos.',
  BCP_BALANCE_RECONCILIATION_INCOMPLETE: 'No se pudo reconciliar el saldo con los movimientos.',
  BCP_UNCLASSIFIED_ROWS_PRESENT: 'Hay filas que el extractor no pudo clasificar.',
  GENERIC_HEADER_NOT_RECOGNISED: 'No se reconocieron los nombres de las columnas de la tabla.',
  GENERIC_ROW_WITHOUT_DATE: 'Alguna fila no tenía una fecha interpretable y se omitió.',
  GENERIC_ROW_WITHOUT_AMOUNT: 'Alguna fila no tenía importes y se omitió.',
  GENERIC_AMOUNT_UNPARSEABLE: 'Un importe no pudo interpretarse con certeza.',
  GENERIC_BALANCE_COLUMN_MISSING:
    'La tabla no trae columna de saldo, así que no se pudo verificar la aritmética.',
};

const CHECK_LABELS: Record<string, string> = {
  BCP_ROWS_PRESENT: 'Se extrajeron filas del documento',
  BCP_ROWS_CLASSIFIED: 'Todas las filas quedaron clasificadas',
  BCP_MOVEMENT_FIELDS: 'Los movimientos tienen sus campos obligatorios',
  BCP_MOVEMENT_AMOUNTS: 'Cargo y abono son excluyentes',
  BCP_DECLARED_TOTALS: 'Los totales declarados cuadran',
  GENERIC_ROWS_PRESENT: 'Se extrajeron filas del documento',
  GENERIC_DATES_PARSED: 'Las fechas se interpretaron correctamente',
  GENERIC_AMOUNTS_EXCLUSIVE: 'Cargo y abono son excluyentes',
  GENERIC_BALANCE_CONTINUITY: 'El saldo avanza de forma consistente',
  BCP_DOCUMENT_BALANCE: 'El saldo global cuadra',
};

const CHECK_STATUS: Record<string, { label: string; className: string }> = {
  PASSED: { label: 'Cumple', className: 'text-emerald-700' },
  FAILED: { label: 'No cumple', className: 'text-red-700' },
  SKIPPED: { label: 'No aplica', className: 'text-slate-500' },
};

export function WarningList({ codes }: { codes: string[] }): ReactNode {
  if (codes.length === 0) {
    return <p className="text-sm text-slate-600">Sin advertencias.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {codes.map((code) => (
        <li key={code} className="rounded-md bg-amber-50 p-3 text-amber-900">
          <p className="font-medium">{WARNING_LABELS[code] ?? 'Advertencia del extractor.'}</p>
          <p className="mt-0.5 font-mono text-xs text-amber-800">{code}</p>
        </li>
      ))}
    </ul>
  );
}

export function CheckList({ checks }: { checks: Check[] }): ReactNode {
  if (checks.length === 0) {
    return <p className="text-sm text-slate-600">Este intento no reportó invariantes.</p>;
  }
  return (
    <ul className="divide-y divide-slate-200 text-sm">
      {checks.map((check) => {
        const status = CHECK_STATUS[check.status] ?? {
          label: check.status,
          className: 'text-slate-600',
        };
        return (
          <li key={check.code} className="flex items-center justify-between gap-4 py-2">
            <span className="text-slate-700">{CHECK_LABELS[check.code] ?? check.code}</span>
            <span className={status.className}>{status.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
