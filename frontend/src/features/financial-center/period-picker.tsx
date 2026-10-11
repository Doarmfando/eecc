import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { getMonthLabel } from '@/lib/month';
import { cn } from '@/lib/utils';

export function MonthPaginator({
  calendarMonth,
  availableMonths,
  onGoToMonth,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
}: {
  calendarMonth: string;
  availableMonths: readonly string[];
  onGoToMonth: (monthKey: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
}): ReactNode {
  return (
    <div className="flex items-center justify-center gap-2 border-t border-border/60 pt-4">
      <button
        type="button"
        aria-label="Periodo anterior"
        disabled={!canGoPrevious}
        onClick={onPrevious}
        className="flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronLeft aria-hidden className="size-4" />
      </button>

      <div className="relative">
        <label className="sr-only" htmlFor="financial-center-month">
          Elegir mes y año
        </label>
        <select
          id="financial-center-month"
          value={calendarMonth}
          onChange={(event) => {
            onGoToMonth(event.target.value);
          }}
          className={cn(
            'cursor-pointer appearance-none rounded-full border border-border bg-card px-4 py-1.5 text-center text-sm font-semibold text-foreground',
            'hover:border-primary/40 focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
          )}
        >
          {availableMonths.map((monthKey) => (
            <option key={monthKey} value={monthKey}>
              {getMonthLabel(monthKey)}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        aria-label="Periodo siguiente"
        disabled={!canGoNext}
        onClick={onNext}
        className="flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronRight aria-hidden className="size-4" />
      </button>
    </div>
  );
}
