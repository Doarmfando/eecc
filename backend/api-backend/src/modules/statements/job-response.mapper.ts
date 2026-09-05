import type { ArtifactKind, JobStatus, Prisma } from '@prisma/client';

import type { JobResponseDto, StatementCheckDto } from './dto/create-statement.dto';

export interface AttemptWithRelations {
  attemptNumber: number;
  extractorId: string | null;
  extractorVersion: string | null;
  rowCount: number | null;
  movementCount: number | null;
  pageCount: number | null;
  checks: Prisma.JsonValue | null;
  warnings: { code: string }[];
  artifacts: { id: string; kind: ArtifactKind; byteSize: number; objectKey: string }[];
}

export interface JobResponseInput {
  jobId: string;
  statementId: string;
  status: JobStatus;
  attempt: AttemptWithRelations;
  reused: boolean;
}

/** Traduce filas de PostgreSQL al contrato público, sin exponer claves de objeto. */
export function toJobResponse(input: JobResponseInput): JobResponseDto {
  const { attempt } = input;
  return {
    jobId: input.jobId,
    statementId: input.statementId,
    status: input.status,
    attemptNumber: attempt.attemptNumber,
    extractorId: attempt.extractorId ?? '',
    extractorVersion: attempt.extractorVersion ?? '',
    rowCount: attempt.rowCount ?? 0,
    movementCount: attempt.movementCount ?? 0,
    pageCount: attempt.pageCount ?? 0,
    warningCodes: attempt.warnings.map((warning) => warning.code),
    checks: readChecks(attempt.checks),
    artifacts: attempt.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      byteSize: artifact.byteSize,
      name: artifactName(artifact.objectKey),
    })),
    reused: input.reused,
  };
}

/**
 * Último segmento de la clave de objeto. Para los resultados es el nombre que
 * generó el worker (`statement_Movimientos.csv`); para el PDF de origen es un
 * identificador opaco. En ningún caso proviene del archivo que subió el usuario.
 */
export function artifactName(objectKey: string): string {
  const segments = objectKey.split('/');
  return segments[segments.length - 1] ?? objectKey;
}

/** El `jsonb` se valida al leerlo: nunca se confía en su forma almacenada. */
export function readChecks(value: Prisma.JsonValue | null): StatementCheckDto[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const checks: StatementCheckDto[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.code === 'string' && typeof record.status === 'string') {
      checks.push({ code: record.code, status: record.status });
    }
  }
  return checks;
}
