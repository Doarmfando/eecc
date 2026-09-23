import { useQueries } from '@tanstack/react-query';

import { useSession } from '@/app/use-session';
import { fetchArtifactText, fetchJob, type ApiClientOptions } from '@/lib/api-client';
import { ApiError, isRetriable } from '@/lib/api-error';
import { toMonthKey } from '@/lib/month';
import type { Artifact, JobListItem } from '@/types/job';

import { buildFinancialStatement } from './statement-from-csv';
import type { FinancialStatement } from './types';

const MAX_ATTEMPTS = 3;

export function financialStatementQueryKey(jobId: string): readonly unknown[] {
  return ['financial-statement', jobId];
}

/**
 * El CSV de una hoja concreta del resultado.
 *
 * El nombre lo generó el sistema (`statement_Movimientos.csv`), nunca el archivo
 * que subió la persona; es el mismo criterio que usa `describeArtifact`.
 */
function findSheetCsv(artifacts: readonly Artifact[], sheet: string): Artifact | undefined {
  return artifacts.find(
    (artifact) => artifact.kind === 'RESULT_CSV' && artifact.name.endsWith(`_${sheet}.csv`),
  );
}

/**
 * Trae un estado de cuenta del historial y lo arma leyendo sus CSV publicados.
 *
 * No hay endpoint de movimientos ni tabla que los guarde: los archivos ya
 * existen, ya están autorizados por persona y trabajo, y se leen en el
 * navegador. Ver `ADR-0010`.
 */
async function loadStatement(
  options: ApiClientOptions,
  item: JobListItem,
  signal: AbortSignal,
): Promise<FinancialStatement> {
  const job = await fetchJob(options, item.jobId, signal);
  const movements = findSheetCsv(job.artifacts, 'Movimientos');
  if (!movements) {
    throw new ApiError('STATEMENT_NOT_CONSOLIDABLE', 200);
  }
  const summary = findSheetCsv(job.artifacts, 'Resumen');

  const [movementsCsv, summaryCsv] = await Promise.all([
    fetchArtifactText(options, item.jobId, movements.id, signal),
    summary ? fetchArtifactText(options, item.jobId, summary.id, signal) : Promise.resolve(null),
  ]);

  return buildFinancialStatement({
    jobId: item.jobId,
    extractorId: job.extractorId,
    movementsCsv,
    summaryCsv,
    // Solo se usa si el documento no trae ni una fecha legible: al menos ubica
    // el estado de cuenta en el mes en que se procesó.
    fallbackPeriod: toMonthKey(new Date(item.createdAt)),
  });
}

export interface FinancialStatementsState {
  statements: FinancialStatement[];
  isPending: boolean;
  /** Trabajos que no se pudieron leer; el resto igual se consolida. */
  failedJobIds: string[];
}

export function useFinancialStatements(jobs: readonly JobListItem[]): FinancialStatementsState {
  const { baseUrl, estado } = useSession();
  const options: ApiClientOptions | null = estado === 'autenticado' ? { baseUrl } : null;

  return useQueries({
    queries: jobs.map((item) => ({
      queryKey: financialStatementQueryKey(item.jobId),
      enabled: options !== null,
      // Un documento ya procesado no cambia, y sus CSV tampoco: revalidarlos
      // sería volver a descargar información financiera sin motivo.
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<FinancialStatement> => {
        if (!options) {
          throw new ApiError('AUTHENTICATION_REQUIRED', 401);
        }
        return loadStatement(options, item, signal);
      },
      retry: (attempt: number, error: Error) => attempt < MAX_ATTEMPTS - 1 && isRetriable(error),
    })),
    combine: (results): FinancialStatementsState => ({
      statements: results.flatMap((result) => (result.data ? [result.data] : [])),
      isPending: results.some((result) => result.isPending),
      failedJobIds: results.flatMap((result, index) =>
        result.isError && jobs[index] ? [jobs[index].jobId] : [],
      ),
    }),
  });
}
