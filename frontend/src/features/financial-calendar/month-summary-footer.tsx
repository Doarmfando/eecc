import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { formatMoney, type Currency } from '@/lib/format';
import { daysInMonth } from '@/lib/month';
import { cn } from '@/lib/utils';

import type { MonthSummary } from './use-financial-calendar';

const MONTH_DAY_FORMATTER = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' });

/** "2026-08" -> "1 – 31 ago.": los días que cubre el resumen. */
function formatMonthRange(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const last = new Date(Number(yearStr), Number(monthStr) - 1, daysInMonth(monthKey));
  return `1 – ${MONTH_DAY_FORMATTER.format(last)}`;
}

function SummaryItem({
  label,
  value,
  valueClassName,
  className,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  className?: string;
}): ReactNode {
  return (
    <div className={cn('min-w-0 flex-1 px-4 py-3 sm:px-3.5 sm:py-4 lg:px-4', className)}>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p
        title={value}
        className={cn(
          'mt-0.5 truncate text-base leading-tight font-semibold tabular-nums sm:text-sm lg:text-base',
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** En móvil el detalle va en filas (rótulo a la izquierda, importe a la derecha); desde `sm`, en columnas. */
const DETAIL_ITEM =
  'flex items-baseline justify-between gap-3 border-t border-border first:border-t-0 sm:block sm:border-t-0 sm:border-l sm:first:border-l-0';

/**
 * Franja del mes, que se lee como la cuenta que es: saldo inicial + entradas −
 * salidas = saldo final. En móvil solo caben periodo y saldo final; el resto se
 * despliega con el chevron. Desde `sm` hay sitio y va todo a la vista, en orden.
 */
export function MonthSummaryFooter({
  summary,
  currency,
  calendarMonth,
}: {
  summary: MonthSummary;
  currency: Currency;
  calendarMonth: string;
}): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  return (
    <Card className="flex-row flex-wrap items-stretch gap-0 rounded-2xl p-0 sm:flex-nowrap sm:p-0">
      <SummaryItem
        label="Periodo"
        value={formatMonthRange(calendarMonth)}
        valueClassName="text-foreground"
        className="flex-none"
      />
      <SummaryItem
        label="Saldo final"
        value={formatMoney(summary.closingBalanceCents, currency)}
        valueClassName={summary.closingBalanceCents < 0 ? 'text-destructive' : 'text-primary'}
        className="border-l border-border sm:order-last"
      />
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={
          expanded
            ? 'Ocultar saldo inicial, entradas y salidas'
            : 'Ver saldo inicial, entradas y salidas'
        }
        onClick={() => {
          setExpanded((current) => !current);
        }}
        className="flex w-12 shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground sm:hidden"
      >
        <ChevronDown
          aria-hidden
          className={cn('size-5 transition-transform', expanded && 'rotate-180')}
        />
      </button>

      <div
        id={detailsId}
        className={cn(
          'w-full flex-col border-t border-border sm:flex sm:w-auto sm:flex-[3] sm:flex-row sm:border-t-0 sm:border-l',
          expanded ? 'flex' : 'hidden',
        )}
      >
        <SummaryItem
          label="Saldo inicial"
          value={formatMoney(summary.openingBalanceCents, currency)}
          valueClassName={summary.openingBalanceCents < 0 ? 'text-destructive' : 'text-foreground'}
          className={DETAIL_ITEM}
        />
        <SummaryItem
          label="Entradas"
          value={formatMoney(summary.incomeCents, currency)}
          valueClassName="text-success"
          className={DETAIL_ITEM}
        />
        <SummaryItem
          label="Salidas"
          value={formatMoney(summary.expenseCents, currency)}
          valueClassName="text-destructive"
          className={DETAIL_ITEM}
        />
      </div>
    </Card>
  );
}
