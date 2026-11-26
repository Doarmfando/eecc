import type { ReactNode } from 'react';

import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { mensajeDeError } from '@/features/users/error-messages';
import type { PageHistoryKind } from '@/lib/api-client';
import { formatCount, formatPrice } from '@/lib/format';
import { describirFecha } from '@/lib/page-balance';
import { formatearDia } from '@/lib/plan-dates';

import { usePageHistory } from './queries';

export function PageHistory({ kind }: { kind: PageHistoryKind }): ReactNode {
  const historial = usePageHistory(kind);
  const items = historial.data?.pages.flatMap((pagina) => pagina.items) ?? [];
  const compras = kind === 'purchases';

  return (
    <Card>
      <CardTitle>{compras ? 'Historial de compras' : 'Historial de consumo'}</CardTitle>
      {historial.isPending ? (
        <CardDescription role="status">Cargando historial…</CardDescription>
      ) : null}
      {historial.isError ? (
        <Alert variant="destructive" title="No se pudo cargar el historial">
          {mensajeDeError(historial.error)}
          <SupportDetails error={historial.error} />
        </Alert>
      ) : null}
      {historial.isSuccess && items.length === 0 ? (
        <CardDescription>
          {compras ? 'Aún no tienes compras.' : 'Aún no has consumido páginas.'}
        </CardDescription>
      ) : null}
      {items.length > 0 ? (
        <ul className="divide-y divide-border/70">
          {items.map((item) => (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap justify-between gap-x-4 text-sm">
                {item.kind === 'purchase' ? (
                  <p className="font-medium text-foreground">{item.productName}</p>
                ) : (
                  <p className="font-medium text-foreground">
                    {formatCount(item.pages)} páginas procesadas
                  </p>
                )}
                <time dateTime={item.occurredAt} className="text-muted-foreground">
                  {describirFecha(item.occurredAt)}
                </time>
              </div>
              {item.kind === 'purchase' ? (
                <p className="text-sm text-muted-foreground">
                  {formatCount(item.pages)} páginas
                  {item.priceCents !== null && item.currency
                    ? ` · ${formatPrice(item.priceCents, item.currency)}`
                    : ''}
                  {item.expiresOn ? ` · Vence el ${formatearDia(item.expiresOn)}` : ''}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {historial.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={historial.isFetching}
          onClick={() => {
            void historial.fetchNextPage();
          }}
        >
          {historial.isFetchingNextPage
            ? 'Cargando…'
            : compras
              ? 'Ver más compras'
              : 'Ver más consumos'}
        </Button>
      ) : null}
    </Card>
  );
}
