import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useSession } from '@/app/use-session';
import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { MemberBalanceCard } from '@/features/balance/member-balance-card';
import { PersonalCard } from '@/features/balance/personal-card';
import { mensajeDeError } from '@/features/users/error-messages';
import { nombreDeRol } from '@/features/users/roles';
import { describirVigencia, hoyLocal } from '@/lib/plan-dates';
import { fetchMemberDetail } from '@/lib/session-client';

function fecha(iso: string | null): string {
  if (!iso) {
    return 'Nunca';
  }
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
}

function iniciales(nombre: string): string {
  return (
    nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((parte) => parte.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

/** Una fila `etiqueta: valor` del panel de datos. */
function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Página propia de una cuenta, con su propia URL: rol, membresía, vigencia,
 * documentos guardados, último acceso y su saldo de páginas por lote, con el
 * registro de compras (ADR-0019). Separada del listado de *Usuarios* porque es
 * más de lo que vale la pena pedir para cada fila de una tabla.
 */
export function MemberDetailPage(): ReactNode {
  const { baseUrl } = useSession();
  const { userId } = useParams<{ userId: string }>();
  const detalle = useQuery({
    queryKey: ['miembro-detalle', userId],
    enabled: userId !== undefined,
    queryFn: ({ signal }) => fetchMemberDetail(baseUrl, userId ?? '', signal),
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <Link
        to="/usuarios"
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Volver a Usuarios
      </Link>

      {detalle.isPending ? (
        <Card>
          <div className="flex items-center gap-3">
            <Loader2 aria-hidden className="size-5 animate-spin text-slate-500" />
            <CardTitle>Cargando la cuenta</CardTitle>
          </div>
        </Card>
      ) : null}

      {detalle.isError ? (
        <Alert variant="destructive" title="No se pudo cargar el detalle">
          {mensajeDeError(detalle.error)}
          <SupportDetails error={detalle.error} />
        </Alert>
      ) : null}

      {detalle.data ? (
        <>
          <Card>
            <div className="flex items-center gap-4">
              <span
                aria-hidden
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary"
              >
                {iniciales(detalle.data.displayName)}
              </span>
              <div className="min-w-0">
                <CardTitle className="truncate">{detalle.data.displayName}</CardTitle>
                <CardDescription className="truncate">{detalle.data.email}</CardDescription>
              </div>
            </div>
          </Card>

          <MemberBalanceCard
            userId={detalle.data.userId}
            nombre={detalle.data.displayName}
            puedeRegistrar={detalle.data.actions?.includes('CHANGE_PLAN') ?? false}
          />
          {detalle.data.actions?.includes('CHANGE_PLAN') &&
          ['PERSONAL', 'GRATUITO'].includes(detalle.data.planCode ?? '') ? (
            <PersonalCard userId={detalle.data.userId} />
          ) : null}

          <Card>
            <dl className="divide-y divide-border/70">
              <Dato etiqueta="Rol">{nombreDeRol(detalle.data.role, detalle.data.roleName)}</Dato>
              <Dato etiqueta="Membresía">{detalle.data.planName ?? detalle.data.planCode}</Dato>
              {detalle.data.planExpiryRequired ? (
                <Dato etiqueta="Vigencia">
                  {detalle.data.planExpiresOn
                    ? describirVigencia(
                        detalle.data.planExpiresOn,
                        hoyLocal(),
                        detalle.data.planExpired ?? false,
                      )
                    : 'Sin vencimiento'}
                </Dato>
              ) : null}
              <Dato etiqueta="Estado">
                {detalle.data.membershipStatus === 'ACTIVE' ? 'Activa' : 'Desactivada'}
              </Dato>
              <Dato etiqueta="Documentos guardados">{detalle.data.documentCount}</Dato>
              <Dato etiqueta="Última vez que entró">{fecha(detalle.data.lastLoginAt)}</Dato>
              <Dato etiqueta="Cuenta creada">{fecha(detalle.data.createdAt)}</Dato>
            </dl>
          </Card>
        </>
      ) : null}
    </div>
  );
}
