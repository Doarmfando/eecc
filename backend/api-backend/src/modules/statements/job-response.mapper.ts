import type { ArtifactKind, JobStatus, Prisma } from '@prisma/client';

import type { JobResponseDto, StatementCheckDto, WarningPageDto } from './dto/create-statement.dto';

export interface AttemptWithRelations {
  attemptNumber: number;
  extractorId: string | null;
  extractorVersion: string | null;
  rowCount: number | null;
  movementCount: number | null;
  pageCount: number | null;
  checks: Prisma.JsonValue | null;
  /** Una fila por aviso; los que se pueden ubicar, una por página. */
  warnings: { code: string; page?: number | null }[];
  artifacts: { id: string; kind: ArtifactKind; byteSize: number; objectKey: string }[];
}

export interface JobResponseInput {
  sourceFileName?: string | null;
  jobId: string;
  statementId: string;
  /** Alta del trabajo: la fecha de la subida y de su conversión. */
  createdAt: Date;
  status: JobStatus;
  attempt: AttemptWithRelations;
  reused: boolean;
  /** Documentos que el cupo retiró para guardar este. Vacío si no hizo falta. */
  replacedStatements?: { statementId: string; sourceFileName: string | null }[];
}

/** Traduce filas de PostgreSQL al contrato público, sin exponer claves de objeto. */
export function toJobResponse(input: JobResponseInput): JobResponseDto {
  const { attempt } = input;
  return {
    jobId: input.jobId,
    statementId: input.statementId,
    sourceFileName: input.sourceFileName ?? null,
    createdAt: input.createdAt.toISOString(),
    status: input.status,
    attemptNumber: attempt.attemptNumber,
    extractorId: attempt.extractorId ?? '',
    extractorVersion: attempt.extractorVersion ?? '',
    rowCount: attempt.rowCount ?? 0,
    movementCount: attempt.movementCount ?? 0,
    pageCount: attempt.pageCount ?? 0,
    // Un aviso ubicado en dos páginas son dos filas, pero un solo código.
    warningCodes: [...new Set(attempt.warnings.map((warning) => warning.code))],
    warningPages: readWarningPages(attempt.warnings),
    checks: readChecks(attempt.checks),
    artifacts: attempt.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      byteSize: artifact.byteSize,
      name: artifactName(artifact.objectKey),
    })),
    reused: input.reused,
    replacedStatements: input.replacedStatements ?? [],
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

/** Los avisos con página, en el orden del documento. */
export function readWarningPages(
  warnings: readonly { code: string; page?: number | null }[],
): WarningPageDto[] {
  return warnings
    .flatMap((warning) =>
      typeof warning.page === 'number' && warning.page > 0
        ? [{ code: warning.code, page: warning.page }]
        : [],
    )
    .sort((a, b) => a.page - b.page || a.code.localeCompare(b.code));
}

/**
 * Las filas de `job_warnings` de un resultado del worker: una por aviso, o una
 * por página cuando el aviso se puede ubicar. Una página de un código que no se
 * reportó se ignora: el código es lo que cambia el estado, la página solo ubica.
 */
export function warningRows(
  codes: readonly string[],
  pages: readonly { code: string; page: number }[] = [],
): { code: string; page: number | null }[] {
  const byCode = new Map<string, number[]>();
  for (const { code, page } of pages) {
    byCode.set(code, [...(byCode.get(code) ?? []), page]);
  }
  return [...new Set(codes)].flatMap<{ code: string; page: number | null }>((code) => {
    const located = [...new Set(byCode.get(code) ?? [])];
    return located.length > 0 ? located.map((page) => ({ code, page })) : [{ code, page: null }];
  });
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
