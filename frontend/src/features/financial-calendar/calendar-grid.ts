export const WEEKDAY_LABELS: readonly string[] = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export interface CalendarCell {
  date: string;
  dayNumber: number;
}

function parseMonthKey(monthKey: string): [number, number] {
  const [yearStr, monthStr] = monthKey.split('-');
  return [Number(yearStr), Number(monthStr)];
}

export function toMonthKey(date: Date): string {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(monthKey: string): number {
  const [year, month] = parseMonthKey(monthKey);
  return new Date(year, month, 0).getDate();
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = parseMonthKey(monthKey);
  return toMonthKey(new Date(year, month - 1 + delta, 1));
}

export function getMonthLabel(monthKey: string): string {
  const [year, month] = parseMonthKey(monthKey);
  const label = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Semana de lunes a domingo: celdas nulas antes del día 1 y después del último
 * día completan la cuadrícula a múltiplos de 7 para que el grid quede parejo.
 */
export function buildCalendarCells(monthKey: string): (CalendarCell | null)[] {
  const [year, month] = parseMonthKey(monthKey);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const leadingBlanks = (firstWeekday + 6) % 7;
  const total = daysInMonth(monthKey);

  const cells: (CalendarCell | null)[] = Array.from({ length: leadingBlanks }, () => null);
  for (let day = 1; day <= total; day += 1) {
    cells.push({
      date: `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      dayNumber: day,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}
