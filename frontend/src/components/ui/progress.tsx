import * as ProgressPrimitive from '@radix-ui/react-progress';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Progress({
  className,
  value,
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root>): ReactNode {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'h-full w-full flex-1 bg-primary transition-transform',
          value === null || value === undefined ? 'animate-pulse' : '',
        )}
        style={{ transform: `translateX(-${String(100 - (value ?? 0))}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
