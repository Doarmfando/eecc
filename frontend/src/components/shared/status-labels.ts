import type { JobStatus } from '@/types/job';

export const STATUS_LABELS: Record<JobStatus, { label: string; className: string; dot: string }> = {
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

export function statusLabel(status: JobStatus): string {
  return STATUS_LABELS[status].label;
}
