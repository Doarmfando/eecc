import { Pencil, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { mensajeDeError } from '@/features/users/error-messages';
import { formatCount, formatPrice } from '@/lib/format';
import type { CommercialProductAdmin } from '@/lib/session-client';
import { cn } from '@/lib/utils';

import { CrearProductoDialog, EditarProductoDialog } from './product-dialogs';
import { useCommercialProductsForAdmin } from './queries';

/** «S/ 0.15 por página», o «S/ 29.90» para un paquete: el precio dice lo que se cobra. */
function precio(producto: CommercialProductAdmin): string {
  const importe = formatPrice(producto.priceCents, producto.currency);
  return producto.pricing === 'PER_PAGE' ? `${importe} por página` : importe;
}

function paginas(producto: CommercialProductAdmin): string {
  if (producto.pricing === 'PACKAGE') {
    return `${formatCount(producto.pageQuantity ?? 0)} páginas`;
  }
  return `Desde ${formatCount(producto.minimumPages ?? 0)} páginas`;
}

function FilaDeProducto({
  producto,
  onEditar,
}: {
  producto: CommercialProductAdmin;
  onEditar: () => void;
}): ReactNode {
  return (
    <tr
      className={cn('border-b border-border/70 last:border-0', !producto.isActive && 'opacity-60')}
    >
      <td className="px-4 py-3 align-top">
        <p className="font-mono text-xs text-muted-foreground">{producto.code}</p>
        <p className="font-medium text-foreground">
          {producto.name}
          {!producto.isActive ? (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              retirado
            </span>
          ) : null}
        </p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{producto.description}</p>
      </td>
      <td className="px-4 py-3 align-top text-sm text-foreground">{paginas(producto)}</td>
      <td className="px-4 py-3 align-top text-sm text-foreground tabular-nums">
        {precio(producto)}
      </td>
      <td className="px-4 py-3 align-top text-sm text-muted-foreground">
        {producto.validityDays} días
      </td>
      <td className="px-4 py-3 align-top">
        <Button size="sm" variant="outline" onClick={onEditar}>
          <Pencil aria-hidden className="size-3.5" />
          Editar
        </Button>
      </td>
    </tr>
  );
}

/**
 * Recargas y paquetes Profesional (ADR-0019): se venden aparte de la membresía,
 * se apilan y no habilitan vistas. Misma regla de acceso que los planes:
 * `PLANS_MANAGE`.
 */
export function ProductsSection(): ReactNode {
  const productos = useCommercialProductsForAdmin();
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<CommercialProductAdmin | null>(null);

  return (
    <section aria-labelledby="productos-de-saldo" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="productos-de-saldo"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            Productos de saldo
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recargas y paquetes de páginas que se compran aparte de la membresía y no habilitan
            vistas. Un cambio de precio o vigencia aplica a las compras siguientes, no a las ya
            registradas.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setCreando(true);
          }}
        >
          <Plus aria-hidden />
          Nuevo producto
        </Button>
      </div>

      {productos.isError ? (
        <Alert variant="destructive" title="No se pudieron cargar los productos de saldo">
          {mensajeDeError(productos.error)}
          <SupportDetails error={productos.error} />
        </Alert>
      ) : null}

      <Card className="gap-0 overflow-x-auto p-0 sm:p-0">
        {productos.isPending ? (
          <p className="p-5 text-sm text-muted-foreground">Cargando productos…</p>
        ) : (
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-border/70 text-xs text-muted-foreground uppercase">
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Páginas</th>
                <th className="px-4 py-3 font-medium">Precio</th>
                <th className="px-4 py-3 font-medium">Vence a los</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(productos.data ?? []).map((producto) => (
                <FilaDeProducto
                  key={producto.code}
                  producto={producto}
                  onEditar={() => {
                    setEditando(producto);
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <CrearProductoDialog
        open={creando}
        onCerrar={() => {
          setCreando(false);
        }}
      />
      <EditarProductoDialog
        producto={editando}
        onCerrar={() => {
          setEditando(null);
        }}
      />
    </section>
  );
}
