import { ArrowDownRight, ArrowUpRight, Scale } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { formatSoles } from '@/lib/format';
import { cn } from '@/lib/utils';

import { daysInMonth } from './calendar-grid';
import type { MonthSummary } from './use-financial-calendar';

const MONTH_END_FORMATTER = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' });

function formatMonthEndLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  return MONTH_END_FORMATTER.format(new Date(year, month - 1, daysInMonth(monthKey)));
}

function SummaryColumn({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  Icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
  tone: 'primary' | 'success' | 'destructive';
}): ReactNode {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    destructive: 'bg-destructive/10 text-destructive',
  }[tone];

  return (
    <div className="flex flex-1 items-center gap-3 px-5 py-4">
      <span
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', toneClass)}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-xl leading-tight font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function MonthSummaryFooter({
  summary,
  calendarMonth,
}: {
  summary: MonthSummary;
  calendarMonth: string;
}): ReactNode {
  return (
    <Card className="flex-col gap-0 divide-y divide-border rounded-2xl p-0 sm:flex-row sm:divide-x sm:divide-y-0">
      <SummaryColumn
        label={`Balance al ${formatMonthEndLabel(calendarMonth)}`}
        value={formatSoles(summary.closingBalanceCents)}
        Icon={Scale}
        tone="primary"
      />
      <SummaryColumn
        label="Total entradas"
        value={formatSoles(summary.incomeCents)}
        Icon={ArrowUpRight}
        tone="success"
      />
      <SummaryColumn
        label="Total salidas"
        value={formatSoles(summary.expenseCents)}
        Icon={ArrowDownRight}
        tone="destructive"
      />
    </Card>
  );
}
