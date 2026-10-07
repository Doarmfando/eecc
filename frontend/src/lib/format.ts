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

/** Monedas que declaran los estados de cuenta. Soles y dólares nunca se suman entre sí. */
export type Currency = 'PEN' | 'USD';

const CURRENCY_SYMBOLS: Record<Currency, string> = { PEN: 'S/', USD: 'US$' };

export const CURRENCY_NAMES: Record<Currency, string> = { PEN: 'Soles', USD: 'Dólares' };

/**
 * El símbolo se pone a mano: `Intl` escribe el dólar como «USD», «US$» o «$»
 * según el motor, y la misma cuenta no puede verse distinta en cada navegador.
 */
const AMOUNT_FORMATTER = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function currencySymbol(currency: Currency): string {
  return CURRENCY_SYMBOLS[currency];
}

/** `cents` es un entero (unidades × 100): evita que sumar muchas filas arrastre error de coma flotante. */
export function formatMoney(cents: number, currency: Currency): string {
  if (!Number.isFinite(cents)) {
    return '—';
  }
  const sign = cents < 0 ? '-' : '';
  return `${sign}${CURRENCY_SYMBOLS[currency]} ${AMOUNT_FORMATTER.format(Math.abs(cents) / 100)}`;
}
