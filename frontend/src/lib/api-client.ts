import { apiErrorSchema, jobListSchema, jobSchema, type Job, type JobList } from '@/types/job';

import { ApiError } from './api-error';

export interface ApiClientOptions {
  baseUrl: string;
}

export interface UploadStatementInput {
  file: File;
  defaultYear?: number;
  extractorId?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

function joinUrl(baseUrl: string, path: string): string {
  // Sin base configurada, la API vive en el mismo origen que la página.
  if (!baseUrl) {
    return `/${path}`;
  }
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

async function readError(response: Response): Promise<ApiError> {
  const raw: unknown = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(raw);
  if (!parsed.success) {
    return new ApiError('REQUEST_FAILED', response.status);
  }
  return new ApiError(
    parsed.data.code,
    response.status,
    parsed.data.requestId,
    parsed.data.details,
  );
}

interface RequestInput {
  method: 'GET' | 'POST';
  body?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request(
  options: ApiClientOptions,
  path: string,
  input: RequestInput,
): Promise<unknown> {
  // La autorización viaja en la cookie httpOnly: `credentials` es lo único que
  // hace falta, y este código no puede leer el token ni aunque quisiera.
  const init: RequestInit = {
    method: input.method,
    credentials: 'include',
    headers: { ...input.headers },
  };
  if (input.body) {
    init.body = input.body;
  }
  if (input.signal) {
    init.signal = input.signal;
  }

  let response: Response;
  try {
    response = await fetch(joinUrl(options.baseUrl, path), init);
  } catch {
    // No se propaga el error de red original: puede incluir la URL interna.
    throw new ApiError('NETWORK_ERROR', 0);
  }
  if (!response.ok) {
    throw await readError(response);
  }
  try {
    return await response.json();
  } catch {
    // Un cuerpo ilegible en una respuesta exitosa también incumple el contrato.
    throw new ApiError('RESPONSE_CONTRACT_MISMATCH', response.status);
  }
}

function parseJob(payload: unknown): Job {
  const parsed = jobSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError('RESPONSE_CONTRACT_MISMATCH', 200);
  }
  return parsed.data;
}

export async function uploadStatement(
  options: ApiClientOptions,
  input: UploadStatementInput,
): Promise<Job> {
  const form = new FormData();
  form.append('document', input.file, input.file.name);
  if (input.defaultYear !== undefined) {
    form.append('defaultYear', String(input.defaultYear));
  }
  if (input.extractorId) {
    form.append('extractorId', input.extractorId);
  }

  const headers: Record<string, string> = {};
  if (input.idempotencyKey) {
    headers['idempotency-key'] = input.idempotencyKey;
  }

  return parseJob(
    await request(options, 'v1/statements', {
      method: 'POST',
      body: form,
      headers,
      ...(input.signal ? { signal: input.signal } : {}),
    }),
  );
}

export async function fetchJobHistory(
  options: ApiClientOptions,
  params: { limit?: number; cursor?: string } = {},
  signal?: AbortSignal,
): Promise<JobList> {
  const search = new URLSearchParams();
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  if (params.cursor !== undefined) {
    search.set('cursor', params.cursor);
  }
  const query = search.size > 0 ? `?${search.toString()}` : '';

  const payload = await request(options, `v1/jobs${query}`, {
    method: 'GET',
    ...(signal ? { signal } : {}),
  });
  const parsed = jobListSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError('RESPONSE_CONTRACT_MISMATCH', 200);
  }
  return parsed.data;
}

export interface DownloadedArtifact {
  blob: Blob;
  fileName: string;
}

/** Descarga autorizada: el nombre lo decide el servidor, no el documento original. */
export async function downloadArtifact(
  options: ApiClientOptions,
  jobId: string,
  artifactId: string,
): Promise<DownloadedArtifact> {
  const path = `v1/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}/content`;

  let response: Response;
  try {
    response = await fetch(joinUrl(options.baseUrl, path), {
      method: 'GET',
      credentials: 'include',
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 0);
  }
  if (!response.ok) {
    throw await readError(response);
  }
  return {
    blob: await response.blob(),
    fileName: readFileName(response) ?? `${jobId}-${artifactId}`,
  };
}

function readFileName(response: Response): string | null {
  const disposition = response.headers.get('content-disposition');
  const match = disposition ? /filename="([^"]+)"/.exec(disposition) : null;
  return match?.[1] ?? null;
}

export async function fetchJob(
  options: ApiClientOptions,
  jobId: string,
  signal?: AbortSignal,
): Promise<Job> {
  return parseJob(
    await request(options, `v1/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      ...(signal ? { signal } : {}),
    }),
  );
}
