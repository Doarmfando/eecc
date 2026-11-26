import { Loader2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSupportPhone } from '@/features/access/queries';
import { PageLotsList } from '@/features/balance/page-lots-list';
import { describirProducto } from '@/features/balance/products';
import { useCommercialProducts, useQuote } from '@/features/balance/queries';
import { useMonthlyUsage } from '@/features/statements/queries';
import { mensajeDeError } from '@/features/users/error-messages';
import { formatCount, formatPrice } from '@/lib/format';
import { describirFecha } from '@/lib/page-balance';
import type { CommercialProduct } from '@/lib/session-client';

/** Cuánto costarían N páginas sueltas, y si conviene más un paquete. */
function Calculadora({ recarga }: { recarga: CommercialProduct }): ReactNode {
  const minimo = recarga.minimumPages ?? 1;
  const [texto, setTexto] = useState(String(minimo));
  const campoId = useId();
  const limpio = texto.trim();
  const paginas = /^\d{1,6}$/.test(limpio) ? Number(limpio) : undefined;
  const valida = paginas !== undefined && paginas >= minimo;
  const cotizacion = useQuote(valida ? recarga.code : null, paginas);

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-2">
        <Label htmlFor={campoId}>¿Cuántas páginas sueltas necesitas?</Label>
        <Input
          id={campoId}
          type="number"
          min={minimo}
          className="max-w-40"
          value={texto}
          aria-invalid={valida ? undefined : true}
          onChange={(event) => {
            setTexto(event.target.value);
          }}
        />
        {!valida ? (
          <p className="text-xs text-destructive">
            Las recargas son desde {formatCount(minimo)} páginas.
          </p>
        ) : null}
      </div>
      {valida && cotizacion.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Calculando el precio…
        </p>
      ) : null}
      {valida && cotizacion.isError ? (
        <Alert variant="destructive" title="No se pudo calcular el precio">
          {mensajeDeError(cotizacion.error)}
        </Alert>
      ) : null}
      {valida && cotizacion.isSuccess ? (
        <div className="space-y-1 text-sm" aria-live="polite">
          <p className="text-foreground">
            {formatCount(cotizacion.data.pages)} páginas cuestan{' '}
            <strong className="tabular-nums">
              {formatPrice(cotizacion.data.priceCents, cotizacion.data.currency)}
            </strong>{' '}
            y vencen a los {cotizacion.data.validityDays} días.
          </p>
          {cotizacion.data.suggestion ? (
            <p className="text-primary">
              Te conviene <strong>{cotizacion.data.suggestion.name}</strong>:{' '}
              {formatCount(cotizacion.data.suggestion.pages)} páginas por{' '}
              {formatPrice(cotizacion.data.suggestion.priceCents, cotizacion.data.currency)}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Saldo de páginas de quien entra, por lote, y cómo comprar más (ADR-0019).
 *
 * La compra todavía no se paga desde aquí: se paga por Yape y un administrador
 * la registra al confirmarlo. Esta página dice cuánto cuesta y a quién escribir.
 */
export function BalancePage(): ReactNode {
  const saldo = useMonthlyUsage();
  const productos = useCommercialProducts();
  const telefono = useSupportPhone();
  const recarga = productos.data?.find((producto) => producto.pricing === 'PER_PAGE') ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Mi saldo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Las páginas que te quedan para convertir. Se gastan primero las que vencen antes.
        </p>
      </div>

      <Card>
        {saldo.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Cargando tu saldo…
          </p>
        ) : null}
        {saldo.isError ? (
          <Alert variant="destructive" title="No se pudo cargar tu saldo">
            {mensajeDeError(saldo.error)}
            <SupportDetails error={saldo.error} />
          </Alert>
        ) : null}
        {saldo.data?.unlimited ? (
          <CardDescription>
            Tu membresía no tiene tope de páginas: no necesitas saldo.
          </CardDescription>
        ) : null}
        {saldo.data && !saldo.data.unlimited ? (
          <>
            <div>
              <CardTitle>Te quedan {formatCount(saldo.data.pagesAvailable ?? 0)} páginas</CardTitle>
              {saldo.data.period ? (
                <CardDescription>
                  El {describirFecha(saldo.data.period.endsAt)} tu membresía te da{' '}
                  {formatCount(saldo.data.monthlyPageQuota ?? 0)} páginas nuevas, si sigue vigente.
                </CardDescription>
              ) : null}
            </div>
            {saldo.data.membershipExpired ? (
              <Alert title="Tu membresía venció">
                Puedes seguir usando las páginas que compraste aparte hasta que venzan.
              </Alert>
            ) : null}
            <PageLotsList lotes={saldo.data.lots} vacio="No te quedan páginas disponibles." />
          </>
        ) : null}
      </Card>

      <Card>
        <div>
          <CardTitle>Comprar más páginas</CardTitle>
          <CardDescription>
            Se suman a tu membresía sin cambiarla y no habilitan vistas nuevas.
          </CardDescription>
        </div>
        {productos.isError ? (
          <Alert variant="destructive" title="No se pudieron cargar los precios">
            {mensajeDeError(productos.error)}
          </Alert>
        ) : null}
        {productos.data && productos.data.length > 0 ? (
          <ul className="divide-y divide-border/70">
            {productos.data.map((producto) => (
              <li key={producto.code} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-foreground">{producto.name}</p>
                <p className="text-sm text-muted-foreground">{describirProducto(producto)}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {recarga ? <Calculadora recarga={recarga} /> : null}
        <p className="text-sm text-muted-foreground">
          Para comprar, paga por Yape y envía el comprobante
          {telefono ? (
            <>
              {' '}
              a soporte al <strong className="text-foreground">{telefono}</strong>
            </>
          ) : (
            ' a tu administrador'
          )}
          . Las páginas se activan apenas se confirma el pago.
        </p>
      </Card>
    </div>
  );
}
