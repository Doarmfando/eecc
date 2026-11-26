/**
 * Precio de los productos de saldo de ATLAS (ADR-0019), en céntimos enteros.
 *
 * Funciones puras, sin base de datos: el servicio las alimenta con el catálogo
 * vigente. Todo se calcula en céntimos enteros porque la base guarda soles con dos
 * decimales (`DECIMAL(10,2)`): el precio de una página es un número exacto de
 * céntimos y multiplicarlo por un entero nunca pasa por coma flotante.
 */

export const PRICING = { PER_PAGE: 'PER_PAGE', PACKAGE: 'PACKAGE' } as const;
export type Pricing = (typeof PRICING)[keyof typeof PRICING];

export const PRODUCT_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,31}$/;

/** Más páginas que esto en una sola compra es casi seguro un error de tipeo. */
export const MAX_PAGES_PER_PURCHASE = 100_000;

export interface ProductoCotizable {
  code: string;
  name: string;
  pricing: Pricing;
  /** `PACKAGE`: páginas del paquete. `PER_PAGE`: nulo. */
  pageQuantity: number | null;
  /** `PER_PAGE`: mínimo de páginas por compra. `PACKAGE`: nulo. */
  minimumPages: number | null;
  /** `PACKAGE`: precio del paquete. `PER_PAGE`: precio de una página. */
  priceCents: number;
  currency: string;
  validityDays: number;
}

export interface Sugerencia {
  productCode: string;
  name: string;
  pages: number;
  priceCents: number;
  /** Lo que se ahorra frente a la cotización pedida; cero si cuesta lo mismo. */
  savingsCents: number;
}

export interface Cotizacion {
  productCode: string;
  pages: number;
  priceCents: number;
  currency: string;
  validityDays: number;
  /** Un paquete que da al menos esas páginas por no más dinero, o nulo. */
  suggestion: Sugerencia | null;
}

export class CotizacionInvalida extends Error {
  constructor(readonly code: 'QUANTITY_BELOW_MINIMUM' | 'QUANTITY_ABOVE_MAXIMUM') {
    super(code);
  }
}

/**
 * Lo que cuesta comprar `paginasPedidas` de un producto.
 *
 * - `PACKAGE`: el paquete se vende entero; las páginas son las del paquete y lo
 *   pedido no cambia el precio.
 * - `PER_PAGE`: se cobra exacto por página, sin redondear a múltiplos (23 páginas
 *   a S/0.15 son S/3.45). Sin indicar cantidad se cotiza el mínimo.
 *
 * Para una recarga busca además, entre `alternativas`, el paquete más barato que
 * dé al menos esas páginas por no más dinero: con 200 páginas sueltas (S/30.00)
 * conviene Profesional 500 (S/29.90), y la interfaz debe decirlo.
 */
export function cotizar(
  producto: ProductoCotizable,
  paginasPedidas: number | undefined,
  alternativas: readonly ProductoCotizable[] = [],
): Cotizacion {
  if (producto.pricing === PRICING.PACKAGE) {
    return {
      productCode: producto.code,
      pages: producto.pageQuantity ?? 0,
      priceCents: producto.priceCents,
      currency: producto.currency,
      validityDays: producto.validityDays,
      suggestion: null,
    };
  }

  const minimo = producto.minimumPages ?? 1;
  const paginas = paginasPedidas ?? minimo;
  if (!Number.isInteger(paginas) || paginas < minimo) {
    throw new CotizacionInvalida('QUANTITY_BELOW_MINIMUM');
  }
  if (paginas > MAX_PAGES_PER_PURCHASE) {
    throw new CotizacionInvalida('QUANTITY_ABOVE_MAXIMUM');
  }
  const total = paginas * producto.priceCents;
  return {
    productCode: producto.code,
    pages: paginas,
    priceCents: total,
    currency: producto.currency,
    validityDays: producto.validityDays,
    suggestion: paqueteMasConveniente(paginas, total, producto.currency, alternativas),
  };
}

/**
 * El paquete más barato con al menos `paginas` y precio no mayor a `total`, en la
 * misma moneda. A igual precio, el de más páginas. Nulo si ninguno conviene.
 */
export function paqueteMasConveniente(
  paginas: number,
  total: number,
  moneda: string,
  alternativas: readonly ProductoCotizable[],
): Sugerencia | null {
  let mejor: ProductoCotizable | null = null;
  for (const candidato of alternativas) {
    if (
      candidato.pricing !== PRICING.PACKAGE ||
      candidato.currency !== moneda ||
      candidato.pageQuantity === null ||
      candidato.pageQuantity < paginas ||
      candidato.priceCents > total
    ) {
      continue;
    }
    if (
      mejor === null ||
      candidato.priceCents < mejor.priceCents ||
      (candidato.priceCents === mejor.priceCents &&
        candidato.pageQuantity > (mejor.pageQuantity ?? 0))
    ) {
      mejor = candidato;
    }
  }
  if (mejor === null) {
    return null;
  }
  return {
    productCode: mejor.code,
    name: mejor.name,
    pages: mejor.pageQuantity ?? 0,
    priceCents: mejor.priceCents,
    savingsCents: total - mejor.priceCents,
  };
}

/**
 * Lo que exige la restricción `commercial_products_pricing_shape` de la base,
 * comprobado antes para responder con un código claro y no con un error de SQL.
 */
export function formaDePrecioValida(
  pricing: Pricing,
  pageQuantity: number | null,
  minimumPages: number | null,
): boolean {
  if (pricing === PRICING.PACKAGE) {
    return pageQuantity !== null && pageQuantity > 0 && minimumPages === null;
  }
  return minimumPages !== null && minimumPages > 0 && pageQuantity === null;
}
