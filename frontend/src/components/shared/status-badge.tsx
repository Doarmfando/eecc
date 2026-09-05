import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { JobStatus } from '@/types/job';

const STATUS_LABELS: Record<JobStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'bg-slate-100 text-slate-700' },
  UPLOADED: { label: 'Cargado', className: 'bg-slate-100 text-slate-700' },
  QUEUED: { label: 'En cola', className: 'bg-slate-100 text-slate-700' },
  PROCESSING: { label: 'Procesando', className: 'bg-blue-100 text-blue-800' },
  SUCCEEDED: { label: 'Reconciliado', className: 'bg-emerald-100 text-emerald-800' },
  NEEDS_REVIEW: { label: 'Requiere revisión', className: 'bg-amber-100 text-amber-900' },
  FAILED: { label: 'Fallido', className: 'bg-red-100 text-red-800' },
};

export function StatusBadge({ status }: { status: JobStatus }): ReactNode {
  const { label, className } = STATUS_LABELS[status];
  return (
    <span
      className={cn('inline-flex rounded-full px-3 py-1 text-xs font-medium', className)}
      data-testid="status-badge"
    >
      {label}
    </span>
  );
}
