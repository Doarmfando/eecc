import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { JobStatus } from '@/types/job';

import { STATUS_LABELS } from './status-labels';

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
