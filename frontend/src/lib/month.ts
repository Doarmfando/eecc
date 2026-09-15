function parseMonthKey(monthKey: string): [number, number] {
  const [yearStr, monthStr] = monthKey.split('-');
  return [Number(yearStr), Number(monthStr)];
}

export function toMonthKey(date: Date): string {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Fecha local a "YYYY-MM-DD", el mismo formato que usan los movimientos. */
export function toDateKey(date: Date): string {
  return `${toMonthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
}

export function daysInMonth(monthKey: string): number {
  const [year, month] = parseMonthKey(monthKey);
  return new Date(year, month, 0).getDate();
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = parseMonthKey(monthKey);
  return toMonthKey(new Date(year, month - 1 + delta, 1));
}

/** "2026-09" -> "Setiembre de 2026" (es-PE, con mayúscula inicial). */
export function getMonthLabel(monthKey: string): string {
  const [year, month] = parseMonthKey(monthKey);
  const label = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "2026-09" -> "Set. 2026": para paginadores compactos ("< Set. 2026 >"). */
export function getMonthShortLabel(monthKey: string): string {
  const [year, month] = parseMonthKey(monthKey);
  const label = new Intl.DateTimeFormat('es-PE', { month: 'short', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}
