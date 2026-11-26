import { Loader2, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { mensajeDeError } from '@/features/users/error-messages';
import { formatCount } from '@/lib/format';

import { PageLotsList } from './page-lots-list';
import { useMemberPageBalance } from './queries';
import { RegisterPurchaseDialog } from './register-purchase-dialog';

/**
 * Saldo de páginas de una cuenta, por lote, para quien la administra (ADR-0019):
 * cuánto le queda de su periodo y de cada compra, el historial, y el botón para
 * registrar una compra ya cobrada.
 */
export function MemberBalanceCard({
  userId,
  nombre,
  puedeRegistrar,
}: {
  userId: string;
  nombre: string;
  /** Lo mismo que cambiarle la membresía: decide cuánto puede convertir. */
  puedeRegistrar: boolean;
}): ReactNode {
  const saldo = useMemberPageBalance(userId);
  const [registrando, setRegistrando] = useState(false);
  const datos = saldo.data?.balance;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Saldo de páginas</CardTitle>
          <CardDescription>
            {datos?.unlimited
              ? 'Su membresía no tiene tope de cobro: no lleva saldo.'
              : datos
                ? `Le quedan ${formatCount(datos.pagesAvailable ?? 0)} páginas. Se gasta primero lo que vence antes.`
                : 'Lo que le queda de su membresía y de cada compra.'}
          </CardDescription>
        </div>
        {puedeRegistrar ? (
          <Button
            size="sm"
            onClick={() => {
              setRegistrando(true);
            }}
          >
            <Plus aria-hidden />
            Registrar compra
          </Button>
        ) : null}
      </div>

      {saldo.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Cargando saldo…
        </p>
      ) : null}
      {saldo.isError ? (
        <Alert variant="destructive" title="No se pudo cargar el saldo">
          {mensajeDeError(saldo.error)}
          <SupportDetails error={saldo.error} />
        </Alert>
      ) : null}

      {datos && !datos.unlimited ? (
        <>
          {datos.membershipExpired ? (
            <Alert title="Su membresía venció">
              Solo puede convertir con las páginas que compró aparte, hasta que venzan.
            </Alert>
          ) : null}
          <PageLotsList
            lotes={datos.lots}
            conDetalleDeCompra
            vacio="No le quedan páginas disponibles."
          />
        </>
      ) : null}

      {saldo.data && saldo.data.history.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            Historial de lotes ({saldo.data.history.length})
          </summary>
          <div className="mt-3">
            <PageLotsList lotes={saldo.data.history} conDetalleDeCompra />
          </div>
        </details>
      ) : null}

      <RegisterPurchaseDialog
        userId={userId}
        nombre={nombre}
        open={registrando}
        onCerrar={() => {
          setRegistrando(false);
        }}
      />
    </Card>
  );
}
