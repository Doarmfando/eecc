import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { NOMBRE_FUNCION, resumenDePlan, type FeatureCode } from '@/features/access/access';
import { describirVigencia, diasHasta, hoyLocal, sumarMeses } from '@/lib/plan-dates';
import type { PlanOption, RoleOption } from '@/lib/session-client';
import { cn } from '@/lib/utils';

export function FieldError({ message }: { message: string | undefined }): ReactNode {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

/**
 * Campo de contraseña con botón para mostrarla. Quien administra la escribe para
 * entregársela a otra persona: poder comprobar lo tecleado evita entregar una
 * clave con una errata.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type'>): ReactNode {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        className={cn('pr-11', className)}
        autoComplete="new-password"
        spellCheck={false}
        {...props}
      />
      <button
        type="button"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        onClick={() => {
          setVisible((actual) => !actual);
        }}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
      >
        {visible ? (
          <EyeOff aria-hidden className="size-4" />
        ) : (
          <Eye aria-hidden className="size-4" />
        )}
      </button>
    </div>
  );
}

const opcionClass =
  'flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/60 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60';

/** Tarjetas de opción sobre radios nativos: se leen de un vistazo y funcionan con teclado. */
export function ChoiceCard({
  title,
  description,
  ...input
}: { title: string; description: string } & Omit<ComponentProps<'input'>, 'type'>): ReactNode {
  return (
    <label className={opcionClass}>
      <input type="radio" className="mt-0.5 size-4 accent-primary" {...input} />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

/** Roles del catálogo que quien administra puede asignar; la API ya los filtra por rango. */
export function RoleChoice({
  name,
  roles,
  value,
  onChange,
  disabled,
}: {
  name: string;
  roles: readonly RoleOption[];
  value: string;
  onChange: (rol: RoleOption) => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {roles.map((rol) => (
        <ChoiceCard
          key={rol.code}
          name={name}
          value={rol.code}
          title={rol.name}
          description={rol.description}
          checked={value === rol.code}
          disabled={disabled}
          onChange={() => {
            onChange(rol);
          }}
        />
      ))}
    </div>
  );
}

function describirPlan(plan: PlanOption): string {
  // En el orden del menú, no en el del catálogo.
  const vistas = (Object.keys(NOMBRE_FUNCION) as FeatureCode[])
    .filter((codigo) => plan.features.includes(codigo))
    .map((codigo) => NOMBRE_FUNCION[codigo]);
  const incluye = vistas.length > 0 ? `Conversión, ${vistas.join(', ')}` : 'Solo conversión';
  return `${incluye}. ${resumenDePlan(plan)}.`;
}

/** Membresías del catálogo: nombre, qué vistas incluye y sus límites. */
export function PlanChoice({
  name,
  plans,
  value,
  onChange,
  disabled,
}: {
  name: string;
  plans: readonly PlanOption[];
  value: string;
  onChange: (codigo: string) => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {plans.map((plan) => (
        <ChoiceCard
          key={plan.code}
          name={name}
          value={plan.code}
          title={plan.name}
          description={describirPlan(plan)}
          checked={value === plan.code}
          disabled={disabled}
          onChange={() => {
            onChange(plan.code);
          }}
        />
      ))}
    </div>
  );
}

const ATAJOS: readonly { meses: number; etiqueta: string }[] = [
  { meses: 1, etiqueta: '1 mes' },
  { meses: 3, etiqueta: '3 meses' },
  { meses: 6, etiqueta: '6 meses' },
  { meses: 12, etiqueta: '1 año' },
];

/**
 * Hasta cuándo vale la membresía. Los atajos cuentan desde `desde`: hoy en un
 * alta, o el vencimiento actual si aún no pasó (renovar no regala ni quita días).
 */
export function VigenciaField({
  id,
  value,
  onChange,
  desde,
  error,
  disabled,
  permitirQuitar,
}: {
  id: string;
  value: string;
  onChange: (dia: string) => void;
  desde: string;
  error?: string | undefined;
  disabled?: boolean;
  /** En la edición se puede dejar sin vencimiento; en el alta, no. */
  permitirQuitar?: boolean;
}): ReactNode {
  const hoy = hoyLocal();
  const pasada = value !== '' && diasHasta(value, hoy) < 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Duración de la membresía">
        {ATAJOS.map(({ meses, etiqueta }) => {
          const dia = sumarMeses(desde, meses);
          return (
            <button
              key={meses}
              type="button"
              disabled={disabled}
              aria-pressed={value === dia}
              onClick={() => {
                onChange(dia);
              }}
              className={cn(
                'cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                value === dia
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {etiqueta}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          id={id}
          type="date"
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className="w-44"
        />
        {permitirQuitar && value !== '' && !disabled ? (
          <button
            type="button"
            onClick={() => {
              onChange('');
            }}
            className="cursor-pointer text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Quitar vencimiento
          </button>
        ) : null}
      </div>
      {error ? (
        <FieldError message={error} />
      ) : value !== '' ? (
        <p className={cn('text-xs', pasada ? 'text-destructive' : 'text-muted-foreground')}>
          {pasada
            ? 'Esa fecha ya pasó: la membresía quedará vencida y no podrá convertir.'
            : `${describirVigencia(value, hoy)}. Después no podrá convertir hasta que la renueves.`}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Sin vencimiento.</p>
      )}
    </div>
  );
}
