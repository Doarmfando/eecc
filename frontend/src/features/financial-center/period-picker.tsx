import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getMonthLabel } from '@/lib/month';
import { cn } from '@/lib/utils';

const arrowClass =
  'flex size-10 cursor-pointer items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-25';

const MONTH_NAMES = Array.from({ length: 12 }, (_, index) => {
  const name = new Intl.DateTimeFormat('es-PE', { month: 'short' })
    .format(new Date(2026, index, 1))
    .replace('.', '');
  return name.charAt(0).toUpperCase() + name.slice(1);
});

function monthKey(year: string, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/**
 * Los doce meses de cada año con documentos, el más reciente arriba. Los meses
 * sin documentos se ven pero no se eligen: así se entiende qué falta.
 */
function MonthGrid({
  calendarMonth,
  availableMonths,
  onPick,
}: {
  calendarMonth: string;
  availableMonths: readonly string[];
  onPick: (monthKey: string) => void;
}): ReactNode {
  const available = new Set(availableMonths);
  const years = [...new Set(availableMonths.map((key) => key.slice(0, 4)))].sort().reverse();
  return (
    <div className="space-y-4">
      {years.map((year) => (
        <div key={year} role="group" aria-label={year}>
          <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">{year}</p>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTH_NAMES.map((name, index) => {
              const key = monthKey(year, index);
              const enabled = available.has(key);
              const active = key === calendarMonth;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!enabled}
                  aria-pressed={active}
                  aria-label={getMonthLabel(key)}
                  onClick={() => {
                    onPick(key);
                  }}
                  className={cn(
                    'h-9 cursor-pointer rounded-lg text-sm font-medium transition-colors',
                    'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-1',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-primary/8 text-primary hover:bg-primary/15',
                    'disabled:cursor-default disabled:bg-transparent disabled:font-normal disabled:text-muted-foreground/45',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * El periodo manda en la vista, como en el Calendario: el mes va grande, fuera
 * de las tarjetas, con sus flechas al lado. El nombre del mes abre un panel con
 * los meses que tienen documentos.
 */
export function PeriodPicker({
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
  const [open, setOpen] = useState(false);
  // Sin documentos legibles no hay mes que nombrar.
  const currentLabel = calendarMonth ? getMonthLabel(calendarMonth) : 'Sin periodo';
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Periodo
        </p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Elegir periodo. Actual: ${currentLabel}`}
              className={cn(
                'group -ml-2 flex max-w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-0.5 text-xl font-bold sm:text-2xl tracking-tight text-foreground transition-colors',
                'hover:bg-accent data-[state=open]:bg-accent',
                'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
              )}
            >
              <span className="whitespace-nowrap">{currentLabel}</span>
              <ChevronDown
                aria-hidden
                className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="w-72 p-4"
            onOpenAutoFocus={(event) => {
              // El foco empieza en el mes que se está viendo, no en el primero del panel.
              event.preventDefault();
              const content = event.currentTarget as HTMLElement | null;
              content?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
            }}
          >
            <p className="mb-3 text-sm font-semibold text-foreground">Elige un periodo</p>
            <MonthGrid
              calendarMonth={calendarMonth}
              availableMonths={availableMonths}
              onPick={(key) => {
                onGoToMonth(key);
                setOpen(false);
              }}
            />
            <p className="mt-4 text-xs text-muted-foreground">
              Solo se pueden elegir los meses con documentos.
            </p>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Periodo anterior"
          disabled={!canGoPrevious}
          onClick={onPrevious}
          className={arrowClass}
        >
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Periodo siguiente"
          disabled={!canGoNext}
          onClick={onNext}
          className={arrowClass}
        >
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  );
}
