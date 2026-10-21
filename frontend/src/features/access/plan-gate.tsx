import { Gem } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useSession } from '@/app/use-session';
import { Alert } from '@/components/ui/alert';

import { NOMBRE_FUNCION, resumenDePlan, type FeatureCode } from './access';
import { usePlans } from './queries';

function enumerar(nombres: readonly string[]): string {
  if (nombres.length <= 1) {
    return nombres.join('');
  }
  return `${nombres.slice(0, -1).join(', ')} o ${nombres[nombres.length - 1] ?? ''}`;
}

/**
 * Lo que ve quien abre una vista que su membresía no incluye: qué es, qué
 * membresías la incluyen —según el catálogo de la API, no una lista fija— y cómo
 * conseguirla. Es una explicación, no una barrera: la API ya aplica los límites.
 */
export function FuncionNoIncluida({ funcion }: { funcion: FeatureCode }): ReactNode {
  const { usuario } = useSession();
  const planes = usePlans();
  const conLaFuncion = (planes.data ?? []).filter((plan) => plan.features.includes(funcion));
  const nombre = NOMBRE_FUNCION[funcion];

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Alert variant="warning" title={`${nombre} no está incluido en tu membresía`}>
        <p>
          {conLaFuncion.length > 0
            ? `Está en la membresía ${enumerar(conLaFuncion.map((plan) => plan.name))}.`
            : 'Está en otras membresías.'}{' '}
          {usuario?.plan
            ? `La tuya, ${usuario.plan.name}, incluye convertir estados de cuenta (${resumenDePlan(usuario.plan)}).`
            : null}{' '}
          Pide a un administrador que cambie tu membresía.
        </p>
        <Link to="/" className="mt-2 inline-block font-medium text-foreground underline">
          Convertir un estado de cuenta
        </Link>
      </Alert>
    </div>
  );
}

/** Membresía de quien tiene la sesión, a la vista en la barra lateral. */
export function PlanBadge(): ReactNode {
  const { usuario } = useSession();
  const plan = usuario?.plan;
  if (!plan) {
    return null;
  }
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Gem aria-hidden className="size-3.5 text-primary" />
        Membresía {plan.name}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{resumenDePlan(plan)}</p>
    </div>
  );
}
