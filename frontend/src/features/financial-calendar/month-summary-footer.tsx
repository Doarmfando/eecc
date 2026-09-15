import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { formatSoles } from '@/lib/format';
import { daysInMonth } from '@/lib/month';
import { cn } from '@/lib/utils';

import type { MonthSummary } from './use-financial-calendar';

const MONTH_END_FORMATTER = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' });

function formatMonthEndLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  return MONTH_END_FORMATTER.format(new Date(year, month - 1, daysInMonth(monthKey)));
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
    <div className={cn('min-w-0 flex-1 px-4 py-3 sm:px-5 sm:py-4', className)}>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 truncate text-base leading-tight font-semibold tabular-nums',
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Franja de cierre del mes. En móvil solo caben fecha y saldo; entradas y salidas
 * se despliegan con el chevron. Desde `sm` hay sitio y van siempre a la vista.
 */
export function MonthSummaryFooter({
  summary,
  calendarMonth,
}: {
  summary: MonthSummary;
  calendarMonth: string;
}): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  return (
    <Card className="flex-row flex-wrap items-stretch gap-0 rounded-2xl p-0 sm:flex-nowrap sm:p-0">
      <SummaryItem
        label="Balance al"
        value={formatMonthEndLabel(calendarMonth)}
        valueClassName="text-foreground"
        className="flex-none"
      />
      <SummaryItem
        label="Saldo"
        value={formatSoles(summary.closingBalanceCents)}
        valueClassName={summary.closingBalanceCents < 0 ? 'text-destructive' : 'text-primary'}
        className="border-l border-border"
      />
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={expanded ? 'Ocultar entradas y salidas' : 'Ver entradas y salidas'}
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
          'w-full border-t border-border sm:flex sm:w-auto sm:flex-[2] sm:border-t-0 sm:border-l',
          expanded ? 'flex' : 'hidden',
        )}
      >
        <SummaryItem
          label="Entradas"
          value={formatSoles(summary.incomeCents)}
          valueClassName="text-success"
        />
        <SummaryItem
          label="Salidas"
          value={formatSoles(summary.expenseCents)}
          valueClassName="text-destructive"
          className="border-l border-border"
        />
      </div>
    </Card>
  );
}
