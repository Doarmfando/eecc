import { currencySymbol, type Currency } from '@/lib/format';

const FULL_FORMATTER = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Se usa en-US porque el compacto de es-PE es "66.4 mil", demasiado largo para la
 * celda; el separador decimal es el mismo en ambos. Tres cifras significativas
 * dejan el texto en cinco caracteres como mucho: "1.04K", "66.4K", "123K", "1.23M".
 */
const COMPACT_FORMATTER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumSignificantDigits: 3,
});

/** Por debajo de mil el compacto conserva los céntimos y solo pierde el símbolo. */
const COMPACT_FROM_CENTS = 100_000;

/** Espacio que no se parte: el símbolo nunca queda en otra línea que el número. */
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

/**
 * Ancho mínimo de la celda para que quepa el importe completo, según sus caracteres.
 * Cada clase oculta el compacto y muestra el completo a partir de ese ancho; las
 * cadenas van enteras para que Tailwind las encuentre. Más de 18 caracteres (mil
 * millones con símbolo) ya no caben en ninguna celda y se quedan en compacto.
 */
const FULL_FIT: ReadonlyArray<{ maxLength: number; compact: string; full: string }> = [
  { maxLength: 8, compact: '@min-[3rem]:hidden', full: '@min-[3rem]:inline' },
  { maxLength: 10, compact: '@min-[3.75rem]:hidden', full: '@min-[3.75rem]:inline' },
  { maxLength: 13, compact: '@min-[5rem]:hidden', full: '@min-[5rem]:inline' },
  { maxLength: 16, compact: '@min-[6rem]:hidden', full: '@min-[6rem]:inline' },
  { maxLength: 18, compact: '@min-[7rem]:hidden', full: '@min-[7rem]:inline' },
];

export interface CellAmount {
  /** Con símbolo y dos decimales, como el resumen del mes: "+S/ 15.49", "US$ 66,387.45". */
  full: string;
  /** Sin símbolo para celdas estrechas: "+15.49", o redondeado desde mil ("66.4K"). */
  compact: string;
  /** Clases de container query que reparten el hueco entre las dos versiones. */
  fit: { compact: string; full: string } | null;
}

/**
 * El importe de una celda del calendario con el símbolo de su moneda: "+S/ 15.49",
 * "−US$ 120.00". Siempre con dos decimales mientras quepa, para que la celda cuadre
 * con la suma del detalle del día. Si la celda es estrecha (móvil, o con el menú
 * lateral abierto) se quita el símbolo, que ya indica el selector de moneda, y
 * desde mil se redondea a "66.4K".
 */
export function formatCellAmount(sign: string, cents: number, currency: Currency): CellAmount {
  const number = FULL_FORMATTER.format(cents / 100);
  const full = `${sign}${currencySymbol(currency)}${NO_BREAK_SPACE}${number}`;
  const compact =
    Math.abs(cents) < COMPACT_FROM_CENTS
      ? `${sign}${number}`
      : `${sign}${COMPACT_FORMATTER.format(cents / 100)}`;
  const fit = FULL_FIT.find((tier) => full.length <= tier.maxLength);
  return { full, compact, fit: fit ? { compact: fit.compact, full: fit.full } : null };
}
