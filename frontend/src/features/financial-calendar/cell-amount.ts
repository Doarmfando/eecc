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

/** Por debajo de mil soles el importe completo ya es corto: no se compacta nunca. */
const COMPACT_FROM_CENTS = 100_000;

/**
 * Ancho mínimo de la celda para que quepa el importe completo, según sus caracteres.
 * Cada clase oculta el compacto y muestra el completo a partir de ese ancho; las
 * cadenas van enteras para que Tailwind las encuentre. Más de 13 caracteres (mil
 * millones) ya no caben en ninguna celda y se quedan en compacto.
 */
const FULL_FIT: ReadonlyArray<{ maxLength: number; compact: string; full: string }> = [
  { maxLength: 8, compact: '@min-[3rem]:hidden', full: '@min-[3rem]:inline' },
  { maxLength: 10, compact: '@min-[3.75rem]:hidden', full: '@min-[3.75rem]:inline' },
  { maxLength: 13, compact: '@min-[5rem]:hidden', full: '@min-[5rem]:inline' },
];

export interface CellAmount {
  /** Soles con sus dos decimales: "+15.49", "66,387.45". */
  full: string;
  /** `null` cuando el completo ya es corto; si no, la versión redondeada ("66.4K"). */
  compact: string | null;
  /** Clases de container query que reparten el hueco entre las dos versiones. */
  fit: { compact: string; full: string } | null;
}

/**
 * El importe de una celda del calendario, sin símbolo de moneda: "+15.49" se lee
 * mejor que "+S/ 15.49". Siempre con dos decimales mientras quepa, para que la
 * celda cuadre con la suma del detalle del día; si la celda es estrecha (móvil, o
 * con el menú lateral abierto) y el importe pasa de mil, se redondea a "66.4K".
 */
export function formatCellAmount(sign: string, cents: number): CellAmount {
  const full = `${sign}${FULL_FORMATTER.format(cents / 100)}`;
  if (Math.abs(cents) < COMPACT_FROM_CENTS) {
    return { full, compact: null, fit: null };
  }
  const compact = `${sign}${COMPACT_FORMATTER.format(cents / 100)}`;
  const fit = FULL_FIT.find((tier) => full.length <= tier.maxLength);
  return { full, compact, fit: fit ? { compact: fit.compact, full: fit.full } : null };
}
