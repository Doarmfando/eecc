import { formatCount, formatPrice } from '@/lib/format';
import type { CommercialProduct } from '@/lib/session-client';

/** «S/ 0.15 por página, desde 20» o «500 páginas por S/ 29.90». */
export function describirProducto(producto: CommercialProduct): string {
  const precio = formatPrice(producto.priceCents, producto.currency);
  if (producto.pricing === 'PER_PAGE') {
    return `${precio} por página, desde ${formatCount(producto.minimumPages ?? 1)}`;
  }
  return `${formatCount(producto.pageQuantity ?? 0)} páginas por ${precio}`;
}
