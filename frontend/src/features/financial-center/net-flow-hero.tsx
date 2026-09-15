import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { formatSoles } from '@/lib/format';
import { cn } from '@/lib/utils';

import { MonthPaginator } from './month-paginator';
import { PeriodSummaryBanner } from './period-summary-banner';
import type { PeriodSummary } from './use-financial-center';

export function NetFlowHero({
  summary,
  calendarMonth,
  availableMonths,
  onGoToMonth,
  onPreviousMonth,
  onNextMonth,
  canGoPreviousMonth,
  canGoNextMonth,
}: {
  summary: PeriodSummary;
  calendarMonth: string;
  availableMonths: readonly string[];
  onGoToMonth: (monthKey: string) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  canGoPreviousMonth: boolean;
  canGoNextMonth: boolean;
}): ReactNode {
  const netCents = summary.abonos - summary.cargos;
  const maxCents = Math.max(1, summary.abonos, summary.cargos);
  const incomeShare = Math.round((summary.abonos / maxCents) * 100);
  const expenseShare = Math.round((summary.cargos / maxCents) * 100);
  const isPositive = netCents >= 0;

  return (
    <Card className="gap-6 rounded-2xl">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Flujo neto del periodo</p>
        <p
          className={cn(
            'mt-1 text-4xl leading-tight font-bold tracking-tight sm:text-5xl',
            isPositive ? 'text-success' : 'text-destructive',
          )}
        >
          {isPositive ? '+' : '−'} {formatSoles(Math.abs(netCents))}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
            <ArrowUpRight aria-hidden className="size-4" />
            Entradas / Abonos
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">{formatSoles(summary.abonos)}</p>
          <div className="mt-2 h-4 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success transition-[width]"
              style={{ width: `${String(incomeShare)}%` }}
            />
          </div>
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <ArrowDownRight aria-hidden className="size-4" />
            Salidas / Cargos
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">{formatSoles(summary.cargos)}</p>
          <div className="mt-2 h-4 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-destructive transition-[width]"
              style={{ width: `${String(expenseShare)}%` }}
            />
          </div>
        </div>
      </div>

      <MonthPaginator
        calendarMonth={calendarMonth}
        availableMonths={availableMonths}
        onGoToMonth={onGoToMonth}
        onPrevious={onPreviousMonth}
        onNext={onNextMonth}
        canGoPrevious={canGoPreviousMonth}
        canGoNext={canGoNextMonth}
      />

      <PeriodSummaryBanner summary={summary} />
    </Card>
  );
}
