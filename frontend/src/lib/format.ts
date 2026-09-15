const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = unit === 0 ? 0 : 1;
  return `${value.toFixed(decimals)} ${UNITS[unit] ?? 'B'}`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('es-PE').format(value);
}

const SOLES_FORMATTER = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

/** `cents` es un entero (soles × 100): evita que sumar muchas filas arrastre error de coma flotante. */
export function formatSoles(cents: number): string {
  if (!Number.isFinite(cents)) {
    return '—';
  }
  return SOLES_FORMATTER.format(cents / 100);
}
