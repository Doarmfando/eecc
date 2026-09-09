import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>): ReactNode {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-6 text-card-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_24px_-16px_rgba(15,23,42,0.12)] sm:p-7',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>): ReactNode {
  return (
    <div data-slot="card-header" className={cn('flex flex-col gap-1.5', className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>): ReactNode {
  return (
    <h2
      data-slot="card-title"
      className={cn('text-lg leading-none font-semibold tracking-tight', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>): ReactNode {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>): ReactNode {
  return <div data-slot="card-content" className={cn(className)} {...props} />;
}
