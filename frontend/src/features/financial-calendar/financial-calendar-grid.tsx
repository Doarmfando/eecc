import type { ReactNode } from 'react';

import { formatMoney, type Currency } from '@/lib/format';
import { toDateKey } from '@/lib/month';
import { cn } from '@/lib/utils';

import { buildCalendarCells, type CalendarCell, WEEKDAYS } from './calendar-grid';
import { type CellAmount, formatCellAmount } from './cell-amount';
import type { DailyFlow, ViewMode } from './use-financial-calendar';

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
  currency: Currency,
): string {
  const parts = [
    count === 0 ? 'sin movimientos' : `${String(count)} movimiento${count === 1 ? '' : 's'}`,
  ];
  if (amountCents !== undefined) {
    parts.push(`${viewMode === 'flujo' ? 'neto' : 'saldo'} ${formatMoney(amountCents, currency)}`);
  }
  return `Día ${String(cell.dayNumber)}${today ? ' (hoy)' : ''}: ${parts.join(', ')}`;
}

/** El importe completo si cabe en la celda; si no, su versión redondeada. */
function CellAmountText({ amount }: { amount: CellAmount }): ReactNode {
  if (amount.compact === null) {
    return amount.full;
  }
  return (
    <>
      <span className={amount.fit?.compact}>{amount.compact}</span>
      {amount.fit ? <span className={cn('hidden', amount.fit.full)}>{amount.full}</span> : null}
    </>
  );
}

/**
 * Un día con movimientos es una "pestaña": cabecera tintada con el número y, debajo,
 * el importe sobre fondo blanco. Los días sin movimientos se quedan en solo el número,
 * para que el ojo vaya directo a donde pasó algo.
 */
function DayCell({
  cell,
  viewMode,
  currency,
  flow,
  balanceCents,
  today,
  selected,
  onSelect,
}: {
  cell: CalendarCell;
  viewMode: ViewMode;
  currency: Currency;
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
      aria-label={describeDay(cell, viewMode, count, amountCents, today, currency)}
      className={cn(
        // 8px fijos: `rounded-lg` del tema son 14px y a este tamaño la celda parece una píldora.
        // `@container`: el formato del importe depende del ancho de la celda, no de la pantalla,
        // porque el menú lateral y la columna del detalle la estrechan a cualquier ancho.
        '@container flex w-full cursor-pointer flex-col overflow-hidden rounded-[0.5rem] text-center transition-[box-shadow,background-color]',
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
          // 9px y letra apretada solo en la celda más estrecha (móvil de 360px): ahí "−999.99"
          // a 10px no cabe.
          'flex h-6 items-center justify-center text-[9px] leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums @min-[2.5rem]:text-[10px] @min-[2.5rem]:tracking-normal @min-[4rem]:text-[11px]',
          amountCents !== undefined && amountToneClass(viewMode, amountCents, hasMovements),
        )}
      >
        {amountCents === undefined ? null : (
          <CellAmountText
            amount={formatCellAmount(signOf(viewMode, amountCents), Math.abs(amountCents))}
          />
        )}
      </span>
    </button>
  );
}

export function FinancialCalendarGrid({
  viewMode,
  currency,
  calendarMonth,
  dailyFlows,
  monthlyBalances,
  selectedDate,
  onSelectDate,
}: {
  viewMode: ViewMode;
  currency: Currency;
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
            currency={currency}
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
