import * as PopoverPrimitive from '@radix-ui/react-popover';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>): ReactNode {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger(
  props: ComponentProps<typeof PopoverPrimitive.Trigger>,
): ReactNode {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverContent({
  className,
  align = 'end',
  sideOffset = 10,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>): ReactNode {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg outline-none',
          'origin-[--radix-popover-content-transform-origin] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:duration-150 data-[state=open]:duration-200',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
