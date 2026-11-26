import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';

import { useSession } from '@/app/use-session';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { monthlyUsageQueryKey } from '@/features/statements/queries';
import { mensajeDeError } from '@/features/users/error-messages';
import { formatCount, formatPrice } from '@/lib/format';
import { formatearDia } from '@/lib/plan-dates';
import {
  cancelPersonalRenewal,
  fetchPersonalState,
  recordPersonalPayment,
  type PersonalPaymentInput,
} from '@/lib/session-client';

export function PersonalCard({ userId }: { userId?: string }): ReactNode {
  const { baseUrl } = useSession();
  const queries = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState('');
  const referenceId = useId();
  const key = ['personal', userId ?? 'propio'];
  const state = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchPersonalState(baseUrl, userId, signal),
    retry: false,
  });
  const action = useMutation({
    mutationFn: async (payment: PersonalPaymentInput | null) => {
      if (userId && payment) await recordPersonalPayment(baseUrl, userId, payment);
      else await cancelPersonalRenewal(baseUrl);
    },
    onSuccess: () => {
      setOpen(false);
      setReference('');
      void queries.invalidateQueries({ queryKey: key });
      void queries.invalidateQueries({ queryKey: monthlyUsageQueryKey() });
      if (userId) {
        void queries.invalidateQueries({ queryKey: ['miembro-detalle', userId] });
        void queries.invalidateQueries({ queryKey: ['miembro-saldo', userId] });
      }
    },
  });

  const data = state.data;
  if (state.isPending)
    return (
      <Card>
        <CardDescription role="status">Consultando ATLAS Personal…</CardDescription>
      </Card>
    );
  if (state.isError)
    return (
      <Alert variant="destructive" title="No se pudo consultar ATLAS Personal">
        {mensajeDeError(state.error)}
      </Alert>
    );
  if (!data || (data.currentPlan !== 'PERSONAL' && !data.canRegister)) return null;

  const precio =
    data.priceCents !== null && data.currency ? formatPrice(data.priceCents, data.currency) : null;
  const admin = userId !== undefined;
  const isPersonal = data.currentPlan === 'PERSONAL';
  return (
    <Card>
      <div>
        <CardTitle>ATLAS Personal</CardTitle>
        <CardDescription>
          {isPersonal && data.expiresOn
            ? `Vigencia hasta el ${formatearDia(data.expiresOn)}.`
            : precio
              ? `${precio} por periodo mensual.`
              : 'Membresía mensual.'}
        </CardDescription>
      </div>
      {data.renewalCancelledAt && isPersonal ? (
        <Alert title="Renovación cancelada">La vigencia ya pagada se conserva.</Alert>
      ) : null}
      {!admin && !data.renewalCancelledAt && data.canRegister ? (
        <CardDescription>
          Solicita la {isPersonal ? 'renovación' : 'activación'} a tu administrador. El pago se
          confirma por Yape.
        </CardDescription>
      ) : null}
      {data.payments.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Pagos de Personal</summary>
          <ul className="mt-2 divide-y divide-border/70">
            {data.payments.map((payment) => (
              <li key={payment.id} className="py-2 text-sm">
                {formatearDia(payment.startsOn)} al {formatearDia(payment.paidThrough)} ·{' '}
                {formatCount(payment.pages)} páginas ·{' '}
                {formatPrice(payment.priceCents, payment.currency)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {(
        admin ? data.canRegister : isPersonal && !data.renewalCancelledAt && data.expiresOn !== null
      ) ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => {
            action.reset();
            setOpen(true);
          }}
        >
          {admin ? 'Registrar pago de Personal' : 'Cancelar renovación'}
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(abierto) => {
          if (!action.isPending) setOpen(abierto);
        }}
      >
        <DialogContent>
          <DialogTitle>{admin ? 'Registrar pago de Personal' : 'Cancelar renovación'}</DialogTitle>
          <DialogDescription>
            {admin
              ? `Confirma que recibiste ${precio ?? 'el importe indicado'} por Yape para registrar el periodo.`
              : 'Mantendrás el acceso hasta el último día del periodo pagado.'}
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (action.isPending) return;
              if (!admin) action.mutate(null);
              else if (data.priceCents !== null && data.currency)
                action.mutate({
                  reference: reference.trim(),
                  priceCents: data.priceCents,
                  currency: data.currency,
                });
            }}
          >
            {admin ? (
              <div className="space-y-2">
                <Label htmlFor={referenceId}>Número de operación de Yape</Label>
                <Input
                  id={referenceId}
                  value={reference}
                  onChange={(event) => {
                    setReference(event.target.value);
                  }}
                  maxLength={100}
                  required
                  autoComplete="off"
                />
              </div>
            ) : null}
            {action.isError ? (
              <Alert variant="destructive" title="No se pudo completar la operación">
                {mensajeDeError(action.error)}
              </Alert>
            ) : null}
            <Button
              type="submit"
              disabled={
                action.isPending ||
                (admin && !/^[A-Z0-9][A-Z0-9._-]{0,99}$/i.test(reference.trim()))
              }
            >
              {admin ? 'Confirmar registro' : 'Confirmar cancelación'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
