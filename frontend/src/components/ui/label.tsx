import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>): ReactNode {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
