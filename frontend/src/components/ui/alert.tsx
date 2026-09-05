import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CircleAlert, Info } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'grid w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        warning: 'border-warning/40 bg-warning/10 text-warning-foreground',
        destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

const ICONS = {
  default: Info,
  warning: AlertTriangle,
  destructive: CircleAlert,
} as const;

const LABELS = {
  default: 'Información',
  warning: 'Advertencia',
  destructive: 'Error',
} as const;

type AlertVariant = keyof typeof ICONS;

export function Alert({
  className,
  variant = 'default',
  title,
  children,
  ...props
}: ComponentProps<'div'> &
  VariantProps<typeof alertVariants> & { title: string; variant?: AlertVariant }): ReactNode {
  const Icon = ICONS[variant];
  return (
    <div
      data-slot="alert"
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <Icon aria-hidden className="mt-0.5 size-4" />
      <p className="font-medium">
        <span className="sr-only">{LABELS[variant]}: </span>
        {title}
      </p>
      {children ? (
        <div className="col-start-2 text-sm text-muted-foreground">{children}</div>
      ) : null}
    </div>
  );
}
