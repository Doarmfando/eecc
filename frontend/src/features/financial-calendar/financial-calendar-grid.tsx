import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

import { buildCalendarCells, getMonthLabel, shiftMonth, WEEKDAY_LABELS } from './calendar-grid';
import type { DailyFlow, ViewMode } from './use-financial-calendar';

function isToday(date: string): boolean {
  const today = new Date();
  const todayKey = `${String(today.getFullYear())}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  return date === todayKey;
}

/** Soles enteros sin símbolo de moneda: en la celda compacta, "+520" se lee mejor que "+S/ 520.00". */
function formatShortAmount(cents: number): string {
  return formatCount(Math.round(cents / 100));
}

function DayCell({
  date,
  dayNumber,
  viewMode,
  flow,
  balanceCents,
  selected,
  onSelect,
}: {
  date: string;
  dayNumber: number;
  viewMode: ViewMode;
  flow: DailyFlow | undefined;
  balanceCents: number | undefined;
  selected: boolean;
  onSelect: (date: string) => void;
}): ReactNode {
  const hasMovements = (flow?.count ?? 0) > 0;
  const netCents = flow?.netCents ?? 0;
  const isPositiveFlow = netCents >= 0;
  const today = isToday(date);

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(date);
      }}
      aria-pressed={selected}
      aria-label={`Día ${String(dayNumber)}${hasMovements ? `, ${String(flow?.count ?? 0)} movimiento(s)` : ', sin movimientos'}`}
      className={cn(
        'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors',
        hasMovements ? 'bg-sky-100/80 hover:bg-sky-100' : 'hover:bg-accent/60',
      )}
    >
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] leading-none font-semibold',
          selected
            ? 'border-2 border-foreground text-foreground'
            : hasMovements
              ? 'text-sky-900'
              : today
                ? 'text-primary'
                : viewMode === 'flujo'
                  ? 'text-muted-foreground/40'
                  : 'text-muted-foreground',
        )}
      >
        {dayNumber}
      </span>

      {viewMode === 'flujo' ? (
        hasMovements ? (
          <span
            className={cn(
              'text-[11px] leading-none font-semibold whitespace-nowrap',
              isPositiveFlow ? 'text-success' : 'text-destructive',
            )}
          >
            {isPositiveFlow ? '+' : '−'}
            {formatShortAmount(Math.abs(netCents))}
          </span>
        ) : null
      ) : (
        <span
          className={cn(
            'text-[11px] leading-none font-semibold whitespace-nowrap',
            hasMovements ? 'text-sky-900/70' : 'text-muted-foreground/70',
          )}
        >
          {formatShortAmount(balanceCents ?? 0)}
        </span>
      )}
    </button>
  );
}

export function FinancialCalendarGrid({
  viewMode,
  calendarMonth,
  onMonthChange,
  dailyFlows,
  monthlyBalances,
  selectedDate,
  onSelectDate,
  minMonth,
  maxMonth,
}: {
  viewMode: ViewMode;
  calendarMonth: string;
  onMonthChange: (month: string) => void;
  dailyFlows: ReadonlyMap<string, DailyFlow>;
  monthlyBalances: ReadonlyMap<string, number>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  minMonth: string;
  maxMonth: string;
}): ReactNode {
  const cells = buildCalendarCells(calendarMonth);

  return (
    <Card className="gap-4 rounded-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{getMonthLabel(calendarMonth)}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mes anterior"
            disabled={calendarMonth <= minMonth}
            onClick={() => {
              onMonthChange(shiftMonth(calendarMonth, -1));
            }}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Mes siguiente"
            disabled={calendarMonth >= maxMonth}
            onClick={() => {
              onMonthChange(shiftMonth(calendarMonth, 1));
            }}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center sm:gap-1.5">
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            className="text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase"
          >
            {label}
          </span>
        ))}
        {cells.map((cell, index) =>
          cell ? (
            <DayCell
              key={cell.date}
              date={cell.date}
              dayNumber={cell.dayNumber}
              viewMode={viewMode}
              flow={dailyFlows.get(cell.date)}
              balanceCents={monthlyBalances.get(cell.date)}
              selected={selectedDate === cell.date}
              onSelect={onSelectDate}
            />
          ) : (
            <span key={`blank-${String(index)}`} aria-hidden />
          ),
        )}
      </div>
    </Card>
  );
}
