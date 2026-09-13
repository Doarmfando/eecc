import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import type { Role } from '@/lib/session-client';
import { cn } from '@/lib/utils';

import { DESCRIPCION_ROL, ETIQUETA_ROL, ROLES } from './roles';

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

export function RoleChoice({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: Role;
  onChange: (rol: Role) => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ROLES.map((rol) => (
        <ChoiceCard
          key={rol}
          name={name}
          value={rol}
          title={ETIQUETA_ROL[rol]}
          description={DESCRIPCION_ROL[rol]}
          checked={value === rol}
          disabled={disabled}
          onChange={() => {
            onChange(rol);
          }}
        />
      ))}
    </div>
  );
}
