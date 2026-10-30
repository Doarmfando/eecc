import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSession } from '@/app/use-session';
import { useJobHistory } from '@/features/statements/queries';
import { isConsolidable, useStatementSelection } from '@/features/statements/statement-selection';
import { fetchArtifactText, fetchJob, type ApiClientOptions } from '@/lib/api-client';
import { ApiError, isRetriable } from '@/lib/api-error';
import { toMonthKey } from '@/lib/month';
import type { Artifact, Job, JobListItem } from '@/types/job';

import { buildFinancialStatement, findSheetCsv } from './statement-from-csv';
import type { FinancialStatement, StatementStatus } from './types';

const MAX_ATTEMPTS = 3;

export function financialStatementQueryKey(jobId: string): readonly unknown[] {
  return ['financial-statement', jobId];
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
  // Cuenta y periodo declarados. Los documentos anteriores a ADR-0012 y el
  // respaldo genérico no la publican: entonces la cuenta queda sin identificar.
  const header = findSheetCsv(job.artifacts, 'Encabezado');
  const optionalText = (artifact: Artifact | undefined): Promise<string | null> =>
    artifact ? fetchArtifactText(options, item.jobId, artifact.id, signal) : Promise.resolve(null);

  const [movementsCsv, summaryCsv, headerCsv] = await Promise.all([
    fetchArtifactText(options, item.jobId, movements.id, signal),
    optionalText(summary),
    optionalText(header),
  ]);

  return buildFinancialStatement({
    jobId: item.jobId,
    extractorId: job.extractorId,
    movementsCsv,
    summaryCsv,
    headerCsv,
    documentName: item.sourceFileName ?? null,
    status: toStatementStatus(job.status),
    extractorVersion: job.extractorVersion || null,
    // Solo se usa si el documento no trae ni una fecha legible: al menos ubica
    // el estado de cuenta en el mes en que se procesó.
    fallbackPeriod: toMonthKey(new Date(item.createdAt)),
  });
}

function toStatementStatus(status: Job['status']): StatementStatus | null {
  return status === 'SUCCEEDED' || status === 'NEEDS_REVIEW' ? status : null;
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

export interface SelectedStatementsState extends FinancialStatementsState {
  history: ReturnType<typeof useJobHistory>;
  /** Documentos del historial que se pueden consolidar, marcados o no. */
  consolidables: JobListItem[];
  /** Los que están marcados en el Historial: lo que se consolida. */
  chosen: JobListItem[];
}

/**
 * Lo que comparten el Centro Financiero y el Calendario: el historial, la
 * selección hecha en él y los estados de cuenta leídos de esos documentos.
 */
export function useSelectedStatements(): SelectedStatementsState {
  const history = useJobHistory();
  const { isIncluded } = useStatementSelection();

  const consolidables = useMemo(
    () => (history.data?.items ?? []).filter(isConsolidable),
    [history.data],
  );
  const chosen = useMemo(
    () => consolidables.filter((job) => isIncluded(job.jobId)),
    [consolidables, isIncluded],
  );

  const loaded = useFinancialStatements(chosen);
  return { ...loaded, history, consolidables, chosen };
}
