import { z } from 'zod';

/**
 * Contrato del API validado en el borde: nunca se confía en la forma de la respuesta.
 */
export const jobStatusSchema = z.enum([
  'PENDING',
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'SUCCEEDED',
  'NEEDS_REVIEW',
  'FAILED',
]);

export const checkSchema = z.object({
  code: z.string(),
  status: z.string(),
});

export const artifactSchema = z.object({
  id: z.string(),
  kind: z.string(),
  byteSize: z.number().int().nonnegative(),
  name: z.string(),
});

export const jobSchema = z.object({
  jobId: z.string(),
  statementId: z.string(),
  status: jobStatusSchema,
  attemptNumber: z.number().int().positive(),
  extractorId: z.string(),
  extractorVersion: z.string(),
  rowCount: z.number().int().nonnegative(),
  movementCount: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  warningCodes: z.array(z.string()),
  checks: z.array(checkSchema),
  artifacts: z.array(artifactSchema),
  reused: z.boolean(),
});

export const jobListItemSchema = z.object({
  jobId: z.string(),
  statementId: z.string(),
  status: jobStatusSchema,
  createdAt: z.string(),
  extractorId: z.string(),
  movementCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  artifactCount: z.number().int().nonnegative(),
  // Opcional para no romper con una API anterior al cupo de retención.
  uploadedByMe: z.boolean().optional().default(false),
});

export const jobListSchema = z.object({
  items: z.array(jobListItemSchema),
  nextCursor: z.string().nullable(),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  requestId: z.string().optional(),
  details: z.array(z.string()).optional(),
});

export type JobStatus = z.infer<typeof jobStatusSchema>;
export type Check = z.infer<typeof checkSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Job = z.infer<typeof jobSchema>;
export type JobListItem = z.infer<typeof jobListItemSchema>;
export type JobList = z.infer<typeof jobListSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

const TERMINAL_STATUSES: readonly JobStatus[] = ['SUCCEEDED', 'NEEDS_REVIEW', 'FAILED'];

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** `NEEDS_REVIEW` no es un éxito: hay salida utilizable con discrepancias. */
export function requiresReview(job: Job): boolean {
  return job.status === 'NEEDS_REVIEW' || job.warningCodes.length > 0;
}
