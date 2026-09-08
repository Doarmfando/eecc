import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useSession } from '@/app/use-session';
import {
  downloadArtifact,
  fetchJob,
  fetchJobHistory,
  uploadStatement,
  type DownloadedArtifact,
  type UploadStatementInput,
} from '@/lib/api-client';
import { ApiError, isRetriable } from '@/lib/api-error';
import { isTerminal, type Job, type JobList } from '@/types/job';

const MAX_ATTEMPTS = 3;
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
      return fetchJobHistory(options, {}, signal);
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
