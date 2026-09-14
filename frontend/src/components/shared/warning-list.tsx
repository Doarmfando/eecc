import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
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
  INTERBANK_ROW_UNCLASSIFIED: 'Una fila con importes no se pudo clasificar como movimiento.',
  INTERBANK_AMOUNT_SIDE_UNKNOWN: 'Un importe sin signo no se pudo asignar a ingresos ni a gastos.',
  INTERBANK_DUPLICATE_OPENING_BALANCE: 'El documento declara más de un saldo inicial.',
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
  INTERBANK_ROWS_PRESENT: 'Se extrajeron filas del documento',
  INTERBANK_OPENING_BALANCE: 'Se encontró el saldo inicial',
  INTERBANK_BALANCE_CONTINUITY: 'El saldo cuadra después de cada movimiento',
  INTERBANK_DECLARED_TOTALS: 'Los totales de ingresos y gastos cuadran',
  INTERBANK_CLOSING_BALANCE: 'El saldo final cuadra',
};

const CHECK_STATUS: Record<
  string,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  PASSED: { label: 'Cumple', className: 'text-success', Icon: CheckCircle2 },
  FAILED: { label: 'No cumple', className: 'text-destructive', Icon: XCircle },
  SKIPPED: { label: 'No aplica', className: 'text-muted-foreground', Icon: MinusCircle },
};

export function WarningList({ codes }: { codes: string[] }): ReactNode {
  if (codes.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin advertencias.</p>;
  }
  return (
    <ul className="space-y-2.5 text-sm">
      {codes.map((code) => (
        <li
          key={code}
          className="flex gap-3 rounded-lg border border-warning/25 bg-warning/8 p-3.5"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-warning-foreground">
              {WARNING_LABELS[code] ?? 'Advertencia del extractor.'}
            </p>
            <p className="mt-0.5 font-mono text-xs text-warning-foreground/70">{code}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CheckList({ checks }: { checks: Check[] }): ReactNode {
  if (checks.length === 0) {
    return <p className="text-sm text-muted-foreground">Este intento no reportó invariantes.</p>;
  }
  return (
    <ul className="divide-y divide-border text-sm">
      {checks.map((check) => {
        const status = CHECK_STATUS[check.status] ?? {
          label: check.status,
          className: 'text-muted-foreground',
          Icon: MinusCircle,
        };
        return (
          <li key={check.code} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-foreground/80">{CHECK_LABELS[check.code] ?? check.code}</span>
            <span className={cn('inline-flex items-center gap-1.5 font-medium', status.className)}>
              <status.Icon aria-hidden className="size-4" />
              {status.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
