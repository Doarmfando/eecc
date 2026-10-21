import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useSession } from '@/app/use-session';
import {
  findSheetCsv,
  readSummary,
  type DeclaredSummary,
} from '@/features/financial-center/statement-from-csv';
import {
  deleteStatements,
  downloadArtifact,
  fetchArtifactText,
  fetchJob,
  fetchJobHistory,
  uploadStatement,
  type DeletedStatements,
  type DownloadedArtifact,
  type UploadStatementInput,
} from '@/lib/api-client';
import { ApiError, isRetriable } from '@/lib/api-error';
import { isTerminal, type Job, type JobList } from '@/types/job';

const MAX_ATTEMPTS = 3;
/** El máximo que sirve la API: cubre el cupo de cualquier membresía actual. */
const HISTORY_PAGE_SIZE = 100;
const BASE_POLL_MS = 2000;
const MAX_POLL_MS = 30000;

/**
 * Opciones del cliente a partir de la sesión.
 *
 * Ya no hay credencial que pasar: la cookie httpOnly viaja sola. `null` cuando aún
 * no hay sesión, para que las consultas no se lancen y reciban un 401 previsible.
 */
function useOpcionesDeApi(): { baseUrl: string } | null {
  const { baseUrl, estado } = useSession();
  return estado === 'autenticado' ? { baseUrl } : null;
}

export function jobQueryKey(jobId: string): readonly unknown[] {
  return ['job', jobId];
}

/** Backoff exponencial acotado; el polling se detiene en cuanto el estado es terminal. */
export function pollInterval(job: Job | undefined, failureCount: number): number | false {
  if (job && isTerminal(job.status)) {
    return false;
  }
  return Math.min(BASE_POLL_MS * 2 ** failureCount, MAX_POLL_MS);
}

export function useUploadStatement(): UseMutationResult<Job, ApiError, UploadStatementInput> {
  const options = useOpcionesDeApi();
  const queryClient = useQueryClient();

  return useMutation<Job, ApiError, UploadStatementInput>({
    mutationFn: async (input) => {
      if (!options) {
        throw new ApiError('AUTHENTICATION_REQUIRED', 401);
      }
      return uploadStatement(options, input);
    },
    retry: (attempt, error) => attempt < MAX_ATTEMPTS - 1 && isRetriable(error),
    onSuccess: () => {
      // Un documento recién publicado debe aparecer en el historial sin recargar.
      void queryClient.invalidateQueries({ queryKey: jobHistoryQueryKey() });
    },
  });
}

/**
 * Borra del historial un documento propio (`statementId`) o todos. Después se
 * refresca todo lo que lee documentos: historial, Centro Financiero, Calendario.
 */
export function useDeleteStatements(): UseMutationResult<
  DeletedStatements,
  ApiError,
  { statementId?: string }
> {
  const options = useOpcionesDeApi();
  const queryClient = useQueryClient();

  return useMutation<DeletedStatements, ApiError, { statementId?: string }>({
    mutationFn: async ({ statementId }) => {
      if (!options) {
        throw new ApiError('AUTHENTICATION_REQUIRED', 401);
      }
      return deleteStatements(options, statementId);
    },
    // Repetir el borrado es inofensivo: la API responde cero si ya no estaba.
    retry: (attempt, error) => attempt < MAX_ATTEMPTS - 1 && isRetriable(error),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

/**
 * Las cifras del `Resumen` de un trabajo, leídas de su CSV publicado.
 *
 * Para decir cuánto no cuadra sin que la API devuelva importes (ADR-0002). `null`
 * si el trabajo no publicó esa hoja; solo se pide con `enabled`.
 */
export function useJobSummaryFigures(
  job: Pick<Job, 'jobId' | 'artifacts'> | undefined,
  enabled: boolean,
): UseQueryResult<DeclaredSummary | null, ApiError> {
  const options = useOpcionesDeApi();
  const resumen = job ? findSheetCsv(job.artifacts, 'Resumen') : undefined;

  return useQuery<DeclaredSummary | null, ApiError>({
    queryKey: ['job-summary-figures', job?.jobId ?? '', resumen?.id ?? ''],
    enabled: enabled && options !== null && job !== undefined,
    // Un resultado publicado no cambia: no hace falta volver a leerlo.
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      if (!options || !job) {
        throw new ApiError('AUTHENTICATION_REQUIRED', 401);
      }
      return resumen
        ? readSummary(await fetchArtifactText(options, job.jobId, resumen.id, signal))
        : null;
    },
    retry: (attempt, error) => attempt < MAX_ATTEMPTS - 1 && isRetriable(error),
  });
}

export function jobHistoryQueryKey(): readonly unknown[] {
  return ['jobs'];
}

export function useJobHistory(): UseQueryResult<JobList, ApiError> {
  const options = useOpcionesDeApi();

  return useQuery<JobList, ApiError>({
    queryKey: jobHistoryQueryKey(),
    enabled: options !== null,
    queryFn: async ({ signal }) => {
      if (!options) {
        throw new ApiError('AUTHENTICATION_REQUIRED', 401);
      }
      return fetchJobHistory(options, { limit: HISTORY_PAGE_SIZE }, signal);
    },
    retry: (attempt, error) => attempt < MAX_ATTEMPTS - 1 && isRetriable(error),
  });
}

export interface DownloadInput {
  jobId: string;
  artifactId: string;
}

export function useDownloadArtifact(): UseMutationResult<
  DownloadedArtifact,
  ApiError,
  DownloadInput
> {
  const options = useOpcionesDeApi();

  return useMutation<DownloadedArtifact, ApiError, DownloadInput>({
    mutationFn: async ({ jobId, artifactId }) => {
      if (!options) {
        throw new ApiError('AUTHENTICATION_REQUIRED', 401);
      }
      return downloadArtifact(options, jobId, artifactId);
    },
    retry: (attempt, error) => attempt < MAX_ATTEMPTS - 1 && isRetriable(error),
  });
}

export function useJob(jobId: string | undefined): UseQueryResult<Job, ApiError> {
  const options = useOpcionesDeApi();

  return useQuery<Job, ApiError>({
    queryKey: jobQueryKey(jobId ?? ''),
    enabled: Boolean(jobId) && options !== null,
    queryFn: async ({ signal }) => {
      if (!options || !jobId) {
        throw new ApiError('AUTHENTICATION_REQUIRED', 401);
      }
      return fetchJob(options, jobId, signal);
    },
    retry: (attempt, error) => attempt < MAX_ATTEMPTS - 1 && isRetriable(error),
    refetchInterval: (query) => pollInterval(query.state.data, query.state.fetchFailureCount),
  });
}
