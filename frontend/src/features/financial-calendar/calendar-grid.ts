import { toDateKey } from '@/lib/month';

/** Semana de lunes a domingo. La cabecera muestra solo la inicial; el nombre queda para lectores de pantalla. */
export const WEEKDAYS: ReadonlyArray<{ initial: string; name: string }> = [
  { initial: 'L', name: 'Lunes' },
  { initial: 'M', name: 'Martes' },
  { initial: 'M', name: 'Miércoles' },
  { initial: 'J', name: 'Jueves' },
  { initial: 'V', name: 'Viernes' },
  { initial: 'S', name: 'Sábado' },
  { initial: 'D', name: 'Domingo' },
];

/** Seis semanas siempre: así el alto del calendario no salta al cambiar de mes. */
export const CALENDAR_CELL_COUNT = 42;

export interface CalendarCell {
  date: string;
  dayNumber: number;
  /** Falso en los días del mes anterior o siguiente que completan la cuadrícula. */
  inMonth: boolean;
}

function parseMonthKey(monthKey: string): [number, number] {
  const [yearStr, monthStr] = monthKey.split('-');
  return [Number(yearStr), Number(monthStr)];
}

/**
 * Cuadrícula de 6 × 7 que arranca el lunes anterior (o igual) al día 1 y se
 * completa con los primeros días del mes siguiente.
 */
export function buildCalendarCells(monthKey: string): CalendarCell[] {
  const [year, month] = parseMonthKey(monthKey);
  const leadingDays = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  return Array.from({ length: CALENDAR_CELL_COUNT }, (_, index) => {
    // Date normaliza días fuera de rango: el día 0 es el último del mes anterior.
    const date = new Date(year, month - 1, 1 - leadingDays + index);
    return {
      date: toDateKey(date),
      dayNumber: date.getDate(),
      inMonth: date.getMonth() === month - 1,
    };
  });
}
