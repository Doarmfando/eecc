import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>): ReactNode {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors',
        'file:mr-3 file:inline-flex file:h-7 file:rounded file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
