import type { ReactNode } from 'react';

import { formatCount, formatSoles } from '@/lib/format';
import { toDateKey } from '@/lib/month';
import { cn } from '@/lib/utils';

import { buildCalendarCells, type CalendarCell, WEEKDAYS } from './calendar-grid';
import type { DailyFlow, ViewMode } from './use-financial-calendar';

/** Soles enteros sin símbolo de moneda: en la celda, "+520" se lee mejor que "+S/ 520.00". */
function formatWholeSoles(cents: number): string {
  return formatCount(Math.round(cents / 100));
}

/**
 * En móvil la columna mide unos 40px: "66,387" no cabe y "66.4K" sí. Se usa en-US
 * porque el compacto de es-PE es "66.4 mil", demasiado largo para la celda; el
 * separador decimal es el mismo en ambos.
 */
const COMPACT_FORMATTER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatCompactSoles(cents: number): string {
  return COMPACT_FORMATTER.format(Math.round(cents / 100));
}

/** El flujo positivo lleva "+"; el saldo solo lleva signo si es negativo. */
function signOf(viewMode: ViewMode, cents: number): string {
  if (cents < 0) {
    return '−';
  }
  return viewMode === 'flujo' && cents > 0 ? '+' : '';
}

/** Como en la referencia, un flujo negativo va en tono neutro: el rojo se reserva al saldo en contra. */
function amountToneClass(viewMode: ViewMode, cents: number, hasMovements: boolean): string {
  if (viewMode === 'flujo') {
    return cents > 0 ? 'text-success' : 'text-foreground/70';
  }
  if (cents < 0) {
    return 'text-destructive';
  }
  return hasMovements ? 'text-foreground/70' : 'text-muted-foreground/70';
}

function describeDay(
  cell: CalendarCell,
  viewMode: ViewMode,
  count: number,
  amountCents: number | undefined,
  today: boolean,
): string {
  const parts = [
    count === 0 ? 'sin movimientos' : `${String(count)} movimiento${count === 1 ? '' : 's'}`,
  ];
  if (amountCents !== undefined) {
    parts.push(`${viewMode === 'flujo' ? 'neto' : 'saldo'} ${formatSoles(amountCents)}`);
  }
  return `Día ${String(cell.dayNumber)}${today ? ' (hoy)' : ''}: ${parts.join(', ')}`;
}

/**
 * Un día con movimientos es una "pestaña": cabecera tintada con el número y, debajo,
 * el importe sobre fondo blanco. Los días sin movimientos se quedan en solo el número,
 * para que el ojo vaya directo a donde pasó algo.
 */
function DayCell({
  cell,
  viewMode,
  flow,
  balanceCents,
  today,
  selected,
  onSelect,
}: {
  cell: CalendarCell;
  viewMode: ViewMode;
  flow: DailyFlow | undefined;
  balanceCents: number | undefined;
  today: boolean;
  selected: boolean;
  onSelect: (date: string) => void;
}): ReactNode {
  const count = flow?.count ?? 0;
  const hasMovements = count > 0;
  // En Flujo, un día sin movimientos no tiene neto que mostrar; en Balance, todos tienen saldo.
  const amountCents =
    viewMode === 'balance' ? balanceCents : hasMovements ? flow?.netCents : undefined;
  const tabbed = hasMovements || selected;

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(cell.date);
      }}
      aria-pressed={selected}
      aria-label={describeDay(cell, viewMode, count, amountCents, today)}
      className={cn(
        // 8px fijos: `rounded-lg` del tema son 14px y a este tamaño la celda parece una píldora.
        'flex w-full cursor-pointer flex-col overflow-hidden rounded-[0.5rem] text-center transition-[box-shadow,background-color]',
        tabbed
          ? 'bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_10px_-6px_rgba(15,23,42,0.18)] ring-1 ring-border/60'
          : 'hover:bg-accent/60',
        selected && 'ring-2 ring-primary',
      )}
    >
      <span
        className={cn(
          'flex h-8 items-center justify-center',
          selected
            ? 'bg-primary text-primary-foreground'
            : hasMovements && 'bg-primary/15 text-foreground',
        )}
      >
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-full border-[1.5px] text-sm leading-none font-medium tabular-nums',
            today ? 'border-current' : 'border-transparent',
          )}
        >
          {cell.dayNumber}
        </span>
      </span>

      <span
        className={cn(
          'flex h-6 items-center justify-center text-[10px] leading-none font-semibold whitespace-nowrap tabular-nums sm:text-[11px]',
          amountCents !== undefined && amountToneClass(viewMode, amountCents, hasMovements),
        )}
      >
        {amountCents === undefined ? null : (
          <>
            <span className="sm:hidden">
              {signOf(viewMode, amountCents)}
              {formatCompactSoles(Math.abs(amountCents))}
            </span>
            <span className="hidden sm:inline">
              {signOf(viewMode, amountCents)}
              {formatWholeSoles(Math.abs(amountCents))}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

export function FinancialCalendarGrid({
  viewMode,
  calendarMonth,
  dailyFlows,
  monthlyBalances,
  selectedDate,
  onSelectDate,
}: {
  viewMode: ViewMode;
  calendarMonth: string;
  dailyFlows: ReadonlyMap<string, DailyFlow>;
  monthlyBalances: ReadonlyMap<string, number>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}): ReactNode {
  const cells = buildCalendarCells(calendarMonth);
  const todayKey = toDateKey(new Date());

  return (
    <div className="grid grid-cols-7 gap-x-1 gap-y-2 text-center sm:gap-x-2 sm:gap-y-3">
      {WEEKDAYS.map((weekday) => (
        <abbr
          key={weekday.name}
          title={weekday.name}
          className="pb-1 text-xs font-medium text-muted-foreground no-underline"
        >
          {weekday.initial}
        </abbr>
      ))}
      {cells.map((cell) =>
        cell.inMonth ? (
          <DayCell
            key={cell.date}
            cell={cell}
            viewMode={viewMode}
            flow={dailyFlows.get(cell.date)}
            balanceCents={monthlyBalances.get(cell.date)}
            today={cell.date === todayKey}
            selected={selectedDate === cell.date}
            onSelect={onSelectDate}
          />
        ) : (
          // Días del mes vecino: solo contexto visual, sin datos ni interacción.
          <span
            key={cell.date}
            aria-hidden
            className="flex h-8 items-center justify-center text-sm font-medium text-muted-foreground/35 tabular-nums"
          >
            {cell.dayNumber}
          </span>
        ),
      )}
    </div>
  );
}
