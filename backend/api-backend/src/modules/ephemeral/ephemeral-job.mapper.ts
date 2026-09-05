import type { JobResponseDto } from '../statements/dto/create-statement.dto';
import type { JobListItemDto } from '../jobs/dto/job-list.dto';
import type { EphemeralJob } from './ephemeral-job.store';

/**
 * Traduce el trabajo en memoria al mismo contrato público que produce
 * `toJobResponse` desde PostgreSQL: el cliente no distingue el modo.
 */
export function toEphemeralJobResponse(job: EphemeralJob, reused: boolean): JobResponseDto {
  return {
    jobId: job.jobId,
    statementId: job.statementId,
    status: job.status,
    attemptNumber: job.attemptNumber,
    extractorId: job.extractorId,
    extractorVersion: job.extractorVersion,
    rowCount: job.rowCount,
    movementCount: job.movementCount,
    pageCount: job.pageCount,
    warningCodes: [...job.warningCodes],
    checks: job.checks.map((check) => ({ code: check.code, status: check.status })),
    artifacts: job.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      byteSize: artifact.byteSize,
      name: artifact.name,
    })),
    reused,
  };
}

export function toEphemeralListItem(job: EphemeralJob): JobListItemDto {
  return {
    jobId: job.jobId,
    statementId: job.statementId,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    extractorId: job.extractorId,
    movementCount: job.movementCount,
    warningCount: job.warningCodes.length,
    artifactCount: job.artifacts.length,
  };
}
