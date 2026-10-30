import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Elegir una de pocas opciones, con el mismo aspecto que el selector
 * Balance/Flujo del Calendario. Son botones con `aria-pressed`, no pestañas:
 * cambian cómo se ve el mismo contenido, no a qué panel se va.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
}): ReactNode {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-1 rounded-xl bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => {
            onChange(option.value);
          }}
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors sm:px-4',
            'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-1',
            value === option.value
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
