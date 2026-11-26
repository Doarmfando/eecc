import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useSession } from '@/app/use-session';
import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { describirVigencia, hoyLocal } from '@/lib/plan-dates';
import { fetchMemberDetail, type Member } from '@/lib/session-client';

import { mensajeDeError } from './error-messages';

function fecha(iso: string | null): string {
  if (!iso) {
    return 'Nunca';
  }
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Una fila `etiqueta: valor`, para no repetir el mismo par de `<dt>`/`<dd>`. */
function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

/** Páginas acumuladas este mes, con una barra: lo que más se pregunta de una cuenta. */
function Paginas({ usadas, tope }: { usadas: number; tope: number | null }): ReactNode {
  if (tope === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Lleva <strong className="text-foreground">{usadas}</strong> páginas este mes; su membresía
        no tiene tope fijo, se cotiza.
      </p>
    );
  }
  const proporcion = tope > 0 ? Math.min((usadas / tope) * 100, 100) : 100;
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">{usadas}</strong> de{' '}
        <strong className="text-foreground">{tope}</strong> páginas acumuladas este mes
      </p>
      <Progress value={proporcion} aria-label="Páginas acumuladas este mes" />
    </div>
  );
}

function ContenidoDetalle({ miembro }: { miembro: Member }): ReactNode {
  const { baseUrl } = useSession();
  const detalle = useQuery({
    queryKey: ['miembro-detalle', miembro.userId],
    queryFn: ({ signal }) => fetchMemberDetail(baseUrl, miembro.userId, signal),
  });

  return (
    <DialogContent className="max-w-md">
      <div className="space-y-1.5 pr-6">
        <DialogTitle>{miembro.displayName}</DialogTitle>
        <DialogDescription>{miembro.email}</DialogDescription>
      </div>

      {detalle.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : detalle.isError ? (
        <Alert variant="destructive" title="No se pudo cargar el detalle">
          {mensajeDeError(detalle.error)}
          <SupportDetails error={detalle.error} />
        </Alert>
      ) : (
        <div className="space-y-4">
          <Paginas usadas={detalle.data.pagesUsed} tope={detalle.data.monthlyPageQuota ?? null} />

          <dl className="divide-y divide-border/70 border-t border-border/70">
            <Dato etiqueta="Rol">{detalle.data.roleName ?? detalle.data.role}</Dato>
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
            <Dato etiqueta="Documentos guardados">{detalle.data.documentCount}</Dato>
            <Dato etiqueta="Última vez que entró">{fecha(detalle.data.lastLoginAt)}</Dato>
            <Dato etiqueta="Cuenta creada">{fecha(detalle.data.createdAt)}</Dato>
          </dl>
        </div>
      )}
    </DialogContent>
  );
}

/**
 * Lo básico de una cuenta para saber cómo va: cuánto ha consumido del acumulado
 * de páginas del mes, además de sus datos de membresía. Pide el detalle aparte
 * del listado porque el acumulado no vale la pena calcularlo para cada fila.
 */
export function MemberDetailDialog({
  miembro,
  onClose,
}: {
  miembro: Member | null;
  onClose: () => void;
}): ReactNode {
  return (
    <Dialog
      open={miembro !== null}
      onOpenChange={(abierto) => {
        if (!abierto) {
          onClose();
        }
      }}
    >
      {miembro ? <ContenidoDetalle key={miembro.userId} miembro={miembro} /> : null}
    </Dialog>
  );
}
