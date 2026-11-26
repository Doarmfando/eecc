import { Pencil, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePlansForAdmin } from '@/features/access/queries';
import { NOMBRE_FUNCION } from '@/features/access/access';
import { CrearPlanDialog, EditarPlanDialog } from '@/features/access/plan-dialogs';
import { mensajeDeError } from '@/features/users/error-messages';
import { cn } from '@/lib/utils';
import type { PlanAdminOption } from '@/lib/session-client';

// Puede traer un código que esta versión de la interfaz todavía no conoce (un
// plan creado con una función nueva): se muestra el código tal cual en vez de
// romper, de ahí el `Record<string, …>` en vez de `FeatureCode`.
const NOMBRES: Record<string, string> = NOMBRE_FUNCION;

function listaDeFunciones(features: string[]): string {
  if (features.length === 0) {
    return 'Solo conversión';
  }
  return features.map((codigo) => NOMBRES[codigo] ?? codigo).join(', ');
}

function FilaDePlan({
  plan,
  onEditar,
}: {
  plan: PlanAdminOption;
  onEditar: () => void;
}): ReactNode {
  return (
    <tr className={cn('border-b border-border/70 last:border-0', !plan.isActive && 'opacity-60')}>
      <td className="px-4 py-3 align-top">
        <p className="font-mono text-xs text-muted-foreground">{plan.code}</p>
        <p className="font-medium text-foreground">
          {plan.name}
          {plan.isDefault ? (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              predeterminado
            </span>
          ) : null}
          {!plan.isActive ? (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              retirado
            </span>
          ) : null}
        </p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{plan.description}</p>
      </td>
      <td className="px-4 py-3 align-top text-sm text-foreground">
        {plan.trialOneTime
          ? `${String(plan.monthlyPageQuota)} (una vez)`
          : (plan.monthlyPageQuota ?? 'Se cotiza')}
      </td>
      <td className="px-4 py-3 align-top text-sm text-muted-foreground">
        {listaDeFunciones(plan.features)}
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
 * Administrar el catálogo de membresías: crear un plan o cambiar precio,
 * páginas y vistas, sin desplegar código (ADR-0018). Solo con `PLANS_MANAGE`,
 * que hoy solo tiene `SUPER_ADMIN`.
 */
export function PlansPage(): ReactNode {
  const planes = usePlansForAdmin();
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<PlanAdminOption | null>(null);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Planes y membresías
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea un plan nuevo o cambia uno existente: precio, páginas acumuladas al mes y vistas
            que habilita. Los cambios aplican sin desplegar nada.
          </p>
        </div>
        <Button
          onClick={() => {
            setCreando(true);
          }}
        >
          <Plus aria-hidden />
          Nuevo plan
        </Button>
      </div>

      {planes.isError ? (
        <Alert variant="destructive" title="No se pudo cargar el catálogo">
          {mensajeDeError(planes.error)}
          <SupportDetails error={planes.error} />
        </Alert>
      ) : null}

      <Card className="gap-0 overflow-x-auto p-0 sm:p-0">
        {planes.isPending ? (
          <p className="p-5 text-sm text-muted-foreground">Cargando planes…</p>
        ) : (
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-border/70 text-xs text-muted-foreground uppercase">
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Páginas/mes</th>
                <th className="px-4 py-3 font-medium">Vistas</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(planes.data ?? []).map((plan) => (
                <FilaDePlan
                  key={plan.code}
                  plan={plan}
                  onEditar={() => {
                    setEditando(plan);
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <CrearPlanDialog
        open={creando}
        onCerrar={() => {
          setCreando(false);
        }}
      />
      <EditarPlanDialog
        plan={editando}
        onCerrar={() => {
          setEditando(null);
        }}
      />
    </div>
  );
}
