import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { getMonthLabel, shiftMonth } from '@/lib/month';

const arrowClass =
  'flex size-10 cursor-pointer items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-25';

/** El mes manda en la vista: va grande, fuera de la tarjeta, con sus flechas al lado. */
export function CalendarMonthHeader({
  calendarMonth,
  onMonthChange,
  minMonth,
  maxMonth,
}: {
  calendarMonth: string;
  onMonthChange: (month: string) => void;
  minMonth: string;
  maxMonth: string;
}): ReactNode {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">
        {getMonthLabel(calendarMonth)}
      </h2>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Mes anterior"
          disabled={calendarMonth <= minMonth}
          onClick={() => {
            onMonthChange(shiftMonth(calendarMonth, -1));
          }}
          className={arrowClass}
        >
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={calendarMonth >= maxMonth}
          onClick={() => {
            onMonthChange(shiftMonth(calendarMonth, 1));
          }}
          className={arrowClass}
        >
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  );
}
