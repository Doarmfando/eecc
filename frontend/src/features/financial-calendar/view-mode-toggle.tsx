import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import type { ViewMode } from './use-financial-calendar';

const OPTIONS: ReadonlyArray<{ value: ViewMode; label: string }> = [
  { value: 'balance', label: 'Balance' },
  { value: 'flujo', label: 'Flujo' },
];

export function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}): ReactNode {
  return (
    <div
      role="tablist"
      aria-label="Modo de vista del calendario"
      className="inline-flex gap-1 rounded-xl bg-muted p-1"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => {
            onChange(option.value);
          }}
          className={cn(
            'cursor-pointer rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors',
            value === option.value
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
