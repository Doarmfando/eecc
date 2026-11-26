import { Loader2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mensajeDeError } from '@/features/users/error-messages';
import { FieldError } from '@/features/users/form-fields';
import { formatCount, formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

import { describirProducto } from './products';
import { useCommercialProducts, useQuote, useRegisterPurchase } from './queries';

const contenidoClass = 'max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto';

/** Entero positivo escrito en el campo, o `undefined` si todavía no lo es. */
function paginasEscritas(texto: string): number | undefined {
  const limpio = texto.trim();
  return /^\d{1,6}$/.test(limpio) && Number(limpio) > 0 ? Number(limpio) : undefined;
}

/**
 * Registrar una compra de Recargas o Profesional que ya se cobró por Yape
 * (ADR-0019). El precio y la vigencia salen del catálogo de hoy; si un paquete
 * da más páginas por menos dinero que la recarga pedida, se ofrece cambiarlo.
 */
export function RegisterPurchaseDialog({
  userId,
  nombre,
  open,
  onCerrar,
}: {
  userId: string;
  nombre: string;
  open: boolean;
  onCerrar: () => void;
}): ReactNode {
  const productos = useCommercialProducts();
  const registrar = useRegisterPurchase(userId);
  const [elegido, setElegido] = useState<string | null>(null);
  const [paginas, setPaginas] = useState('');
  const [referencia, setReferencia] = useState('');
  const [nota, setNota] = useState('');
  const paginasId = useId();
  const referenciaId = useId();
  const notaId = useId();

  const lista = productos.data ?? [];
  const producto = lista.find((candidato) => candidato.code === elegido) ?? lista[0] ?? null;
  const porPagina = producto?.pricing === 'PER_PAGE';
  const minimo = producto?.minimumPages ?? 1;
  const cantidad = porPagina
    ? paginasEscritas(paginas === '' ? String(minimo) : paginas)
    : undefined;
  const bajoMinimo = porPagina && cantidad !== undefined && cantidad < minimo;
  const cantidadInvalida = porPagina && (cantidad === undefined || bajoMinimo);
  const cotizacion = useQuote(
    producto && !cantidadInvalida ? producto.code : null,
    porPagina ? cantidad : undefined,
  );

  function cerrarYLimpiar(): void {
    setElegido(null);
    setPaginas('');
    setReferencia('');
    setNota('');
    registrar.reset();
    onCerrar();
  }

  const listo =
    producto !== null &&
    !cantidadInvalida &&
    cotizacion.isSuccess &&
    !cotizacion.isFetching &&
    !registrar.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => {
        if (!abierto && !registrar.isPending) cerrarYLimpiar();
      }}
    >
      <DialogContent className={contenidoClass}>
        <div className="space-y-1.5 pr-6">
          <DialogTitle>Registrar compra de páginas</DialogTitle>
          <DialogDescription>
            Para {nombre}. Regístrala cuando el pago ya esté confirmado: las páginas se activan en
            el acto.
          </DialogDescription>
        </div>

        {productos.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Cargando productos…
          </p>
        ) : null}
        {productos.isError ? (
          <Alert variant="destructive" title="No se pudieron cargar los productos">
            {mensajeDeError(productos.error)}
          </Alert>
        ) : null}
        {productos.isSuccess && lista.length === 0 ? (
          <Alert title="No hay productos a la venta">
            Activa una recarga o un paquete en Planes y membresías.
          </Alert>
        ) : null}

        {producto ? (
          <form
            className="space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (!listo) {
                return;
              }
              registrar.mutate(
                {
                  productCode: producto.code,
                  ...(porPagina && cantidad !== undefined ? { pages: cantidad } : {}),
                  ...(referencia.trim() ? { paymentReference: referencia.trim() } : {}),
                  ...(nota.trim() ? { note: nota.trim() } : {}),
                },
                { onSuccess: cerrarYLimpiar },
              );
            }}
          >
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Producto</legend>
              <div className="flex flex-col gap-2">
                {lista.map((opcion) => (
                  <label
                    key={opcion.code}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm',
                      opcion.code === producto.code && 'border-primary bg-primary/5',
                    )}
                  >
                    <input
                      type="radio"
                      name="producto"
                      className="mt-0.5 size-4"
                      checked={opcion.code === producto.code}
                      onChange={() => {
                        setElegido(opcion.code);
                      }}
                    />
                    <span>
                      <span className="block font-medium text-foreground">{opcion.name}</span>
                      <span className="block text-muted-foreground">
                        {describirProducto(opcion)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {porPagina ? (
              <div className="space-y-2">
                <Label htmlFor={paginasId}>Páginas</Label>
                <Input
                  id={paginasId}
                  type="number"
                  min={minimo}
                  placeholder={String(minimo)}
                  aria-invalid={cantidadInvalida ? true : undefined}
                  value={paginas}
                  onChange={(event) => {
                    setPaginas(event.target.value);
                  }}
                />
                {cantidadInvalida ? (
                  <FieldError
                    message={`La recarga es desde ${formatCount(minimo)} páginas, en números enteros.`}
                  />
                ) : null}
              </div>
            ) : null}

            {!cantidadInvalida && cotizacion.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">
                Calculando el precio…
              </p>
            ) : null}
            {cotizacion.isSuccess && !cantidadInvalida ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="text-foreground">
                  Total a cobrar:{' '}
                  <strong className="tabular-nums">
                    {formatPrice(cotizacion.data.priceCents, cotizacion.data.currency)}
                  </strong>{' '}
                  por {formatCount(cotizacion.data.pages)} páginas, que vencen a los{' '}
                  {cotizacion.data.validityDays} días.
                </p>
                {cotizacion.data.suggestion ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-muted-foreground">
                      Le conviene <strong>{cotizacion.data.suggestion.name}</strong>:{' '}
                      {formatCount(cotizacion.data.suggestion.pages)} páginas por{' '}
                      {formatPrice(cotizacion.data.suggestion.priceCents, cotizacion.data.currency)}
                      .
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setElegido(cotizacion.data.suggestion?.productCode ?? null);
                      }}
                    >
                      Usar ese paquete
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {cotizacion.isError ? (
              <Alert variant="destructive" title="No se pudo calcular el precio">
                {mensajeDeError(cotizacion.error)}
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor={referenciaId}>N.º de operación de Yape</Label>
              <Input
                id={referenciaId}
                autoComplete="off"
                maxLength={100}
                placeholder="Opcional"
                value={referencia}
                onChange={(event) => {
                  setReferencia(event.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={notaId}>Nota interna</Label>
              <Input
                id={notaId}
                autoComplete="off"
                maxLength={255}
                placeholder="Opcional"
                value={nota}
                onChange={(event) => {
                  setNota(event.target.value);
                }}
              />
            </div>

            {registrar.isError ? (
              <Alert variant="destructive" title="No se pudo registrar la compra">
                {mensajeDeError(registrar.error)}
                <SupportDetails error={registrar.error} />
              </Alert>
            ) : null}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={registrar.isPending}
                onClick={cerrarYLimpiar}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!listo}>
                {registrar.isPending ? 'Registrando…' : 'Registrar compra'}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
