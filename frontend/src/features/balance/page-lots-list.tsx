import type { ReactNode } from 'react';

import { Progress } from '@/components/ui/progress';
import { formatCount, formatPrice } from '@/lib/format';
import { describirVencimiento, nombreDeLote, type PageLot } from '@/lib/page-balance';
import { cn } from '@/lib/utils';

function registradoEl(lote: PageLot): string | null {
  if (!lote.createdAt) {
    return null;
  }
  return new Date(lote.createdAt).toLocaleDateString('es-PE', { dateStyle: 'medium' });
}

/** Detalle de una compra para quien administra: cuánto se cobró, referencia y quién la registró. */
function DatosDeCompra({ lote }: { lote: PageLot }): ReactNode {
  const partes: string[] = [];
  if (lote.pricePaidCents !== null && lote.currency) {
    partes.push(formatPrice(lote.pricePaidCents, lote.currency));
  }
  if (lote.paymentReference) {
    partes.push(`Ref. ${lote.paymentReference}`);
  }
  const fecha = registradoEl(lote);
  if (fecha) {
    partes.push(lote.registeredByName ? `${fecha} por ${lote.registeredByName}` : fecha);
  }
  if (partes.length === 0) {
    return null;
  }
  return <p className="text-xs text-muted-foreground">{partes.join(' · ')}</p>;
}

/**
 * Lotes de páginas en el orden en que se gastan: primero el que vence antes
 * (ADR-0019). Cada uno con lo que le queda, una barra y su vencimiento. Con
 * `conDetalleDeCompra`, quien administra ve además precio y referencia.
 */
export function PageLotsList({
  lotes,
  conDetalleDeCompra = false,
  vacio = 'No tiene páginas disponibles.',
}: {
  lotes: PageLot[];
  conDetalleDeCompra?: boolean;
  vacio?: string;
}): ReactNode {
  if (lotes.length === 0) {
    return <p className="text-sm text-muted-foreground">{vacio}</p>;
  }
  return (
    <ul className="divide-y divide-border/70">
      {lotes.map((lote, indice) => {
        const agotado = lote.available <= 0;
        const proporcion = lote.quantity > 0 ? (lote.available / lote.quantity) * 100 : 0;
        const nombre = nombreDeLote(lote);
        return (
          <li
            key={lote.id ?? `${lote.source}-${String(indice)}`}
            className={cn('space-y-2 py-3 first:pt-0 last:pb-0', agotado && 'opacity-60')}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm font-medium text-foreground">{nombre}</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                <strong className="text-foreground">{formatCount(lote.available)}</strong> de{' '}
                {formatCount(lote.quantity)} páginas
                {lote.held > 0 ? ` · ${formatCount(lote.held)} en uso` : ''}
              </p>
            </div>
            <Progress value={proporcion} aria-label={`Páginas que quedan: ${nombre}`} />
            <p className="text-xs text-muted-foreground">
              {lote.expiresAt === null
                ? 'No vence'
                : `Vence el ${describirVencimiento(lote.expiresAt)}`}
            </p>
            {conDetalleDeCompra && (lote.source === 'PURCHASE' || lote.source === 'ADJUSTMENT') ? (
              <DatosDeCompra lote={lote} />
            ) : null}
            {conDetalleDeCompra && lote.note ? (
              <p className="text-xs text-muted-foreground">Nota: {lote.note}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
