import { AlertTriangle, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { Check, WarningPage } from '@/types/job';

import { describirAviso } from './warning-labels';

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
  BANCO_NACION_ROWS_PRESENT: 'Se extrajeron filas del documento',
  BANCO_NACION_OPENING_BALANCE: 'Se encontró el saldo inicial',
  BANCO_NACION_BALANCE_CONTINUITY: 'El saldo cuadra después de cada movimiento',
  BANCO_NACION_DECLARED_TOTALS: 'Los totales de cargos y abonos cuadran',
  BANCO_NACION_CLOSING_BALANCE: 'El saldo final cuadra',
  BBVA_ROWS_PRESENT: 'Se extrajeron filas del documento',
  BBVA_OPENING_BALANCE: 'Se encontró el saldo anterior',
  BBVA_BALANCE_CONTINUITY: 'El saldo cuadra después de cada movimiento y su ITF',
  BBVA_ITF_TOTALS: 'El total de ITF cuadra con el de cada movimiento',
  BBVA_CLOSING_BALANCE: 'El saldo final cuadra',
};

const CHECK_STATUS: Record<
  string,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  PASSED: { label: 'Cumple', className: 'text-success', Icon: CheckCircle2 },
  FAILED: { label: 'No cumple', className: 'text-destructive', Icon: XCircle },
  SKIPPED: { label: 'No aplica', className: 'text-muted-foreground', Icon: MinusCircle },
};

/**
 * Los códigos se muestran con su explicación. No se traduce a un mensaje único
 * porque el operador necesita saber exactamente qué invariante falló.
 */
export function WarningList({
  codes,
  pages = [],
}: {
  codes: string[];
  /** Dónde mirar los avisos que el extractor pudo ubicar. */
  pages?: readonly WarningPage[];
}): ReactNode {
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
              {describirAviso(
                code,
                pages.filter((page) => page.code === code).map((page) => page.page),
              )}
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
