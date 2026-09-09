import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { JobStatus } from '@/types/job';

const STATUS_LABELS: Record<JobStatus, { label: string; className: string; dot: string }> = {
  PENDING: { label: 'Pendiente', className: 'bg-muted text-muted-foreground', dot: 'bg-slate-400' },
  UPLOADED: { label: 'Cargado', className: 'bg-muted text-muted-foreground', dot: 'bg-slate-400' },
  QUEUED: { label: 'En cola', className: 'bg-muted text-muted-foreground', dot: 'bg-slate-400' },
  PROCESSING: { label: 'Procesando', className: 'bg-primary/10 text-primary', dot: 'bg-primary' },
  SUCCEEDED: { label: 'Reconciliado', className: 'bg-success/12 text-success', dot: 'bg-success' },
  NEEDS_REVIEW: {
    label: 'Requiere revisión',
    className: 'bg-warning/15 text-warning-foreground',
    dot: 'bg-warning',
  },
  FAILED: {
    label: 'Fallido',
    className: 'bg-destructive/10 text-destructive',
    dot: 'bg-destructive',
  },
};

export function StatusBadge({ status }: { status: JobStatus }): ReactNode {
  const { label, className, dot } = STATUS_LABELS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
        className,
      )}
      data-testid="status-badge"
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />
      {label}
    </span>
  );
}
