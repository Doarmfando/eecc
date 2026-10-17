import type { JobListItem } from '@/types/job';

/** Los propios, del más antiguo al más reciente: el primero es el que se propone reemplazar. */
export function replaceableStatements(items: readonly JobListItem[]): JobListItem[] {
  return items
    .filter((job) => job.uploadedByMe)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.jobId.localeCompare(b.jobId));
}
