import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/app-config';
import type { WorkerJobPayload, WorkerProcessRequest } from './worker-client.types';

const WORKER_ERROR_CODES = new Set([
  'INVALID_PDF',
  'PDF_SIZE_LIMIT_EXCEEDED',
  'UNSUPPORTED_DOCUMENT',
  'INVALID_JOB_OPTIONS',
  'STATEMENT_NOT_EXPORTABLE',
]);

/**
 * Único punto que habla con la API interna del worker.
 * NestJS no interpreta PDFs ni conoce reglas bancarias.
 */
@Injectable()
export class WorkerClientService {
  private readonly logger = new Logger(WorkerClientService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async processStatement(request: WorkerProcessRequest): Promise<WorkerJobPayload> {
    const baseUrl = this.config.get('WORKER_BASE_URL', { infer: true });
    const timeout = this.config.get('WORKER_TIMEOUT_MS', { infer: true });

    const form = new FormData();
    form.append(
      'document',
      new Blob([new Uint8Array(request.content)], { type: 'application/pdf' }),
      request.fileName,
    );
    if (request.defaultYear !== undefined) {
      form.append('default_year', String(request.defaultYear));
    }
    if (request.extractorId !== undefined) {
      form.append('extractor_id', request.extractorId);
    }

    const headers: Record<string, string> = {};
    if (request.requestId) {
      headers['x-request-id'] = request.requestId;
    }

    let response: Response;
    try {
      response = await fetch(new URL('/internal/statements', baseUrl), {
        method: 'POST',
        body: form,
        headers,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      this.logger.error(`El worker no respondió: ${describeNetworkError(error)}`);
      throw new BadGatewayException({ code: 'WORKER_UNAVAILABLE' });
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = readCode(body);
      if (code && WORKER_ERROR_CODES.has(code)) {
        throw new UnprocessableEntityException({ code });
      }
      throw new BadGatewayException({ code: 'WORKER_REJECTED_DOCUMENT' });
    }
    if (!isWorkerPayload(body)) {
      throw new BadGatewayException({ code: 'WORKER_CONTRACT_MISMATCH' });
    }
    return body;
  }

  /** Descarga un artefacto ya publicado por el worker. */
  async fetchArtifact(workerJobId: string, name: string): Promise<Buffer> {
    const baseUrl = this.config.get('WORKER_BASE_URL', { infer: true });
    const timeout = this.config.get('WORKER_TIMEOUT_MS', { infer: true });
    const path = `/internal/statements/${encodeURIComponent(workerJobId)}/artifacts/${encodeURIComponent(name)}`;

    let response: Response;
    try {
      response = await fetch(new URL(path, baseUrl), {
        method: 'GET',
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new BadGatewayException({ code: 'WORKER_UNAVAILABLE' });
    }

    if (response.status === 404) {
      throw new NotFoundException({ code: 'ARTIFACT_NOT_FOUND' });
    }
    if (!response.ok) {
      throw new BadGatewayException({ code: 'WORKER_REJECTED_DOCUMENT' });
    }
    return Buffer.from(await response.arrayBuffer());
  }
}

/**
 * Nombre del error y, si la hay, la causa de red que trae `fetch`.
 *
 * Sin la causa, un DNS caído, una conexión rechazada y un cuerpo mal construido
 * salen los tres como `TypeError` y no hay forma de distinguirlos desde el log.
 * Solo se toma el código de la causa, nunca su mensaje, que puede llevar la URL
 * interna del worker.
 */
function describeNetworkError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'error desconocido';
  }
  const cause: unknown = (error as { cause?: unknown }).cause;
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause
      ? (cause as { code?: unknown }).code
      : undefined;
  return typeof code === 'string' ? `${error.name} (${code})` : error.name;
}

function readCode(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'code' in body) {
    const code = body.code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

function isWorkerPayload(body: unknown): body is WorkerJobPayload {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const candidate = body as Partial<WorkerJobPayload>;
  return (
    typeof candidate.job_id === 'string' &&
    typeof candidate.extractor_id === 'string' &&
    typeof candidate.extractor_version === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.row_count === 'number' &&
    typeof candidate.movement_count === 'number' &&
    typeof candidate.page_count === 'number' &&
    Array.isArray(candidate.warning_codes) &&
    Array.isArray(candidate.checks) &&
    Array.isArray(candidate.artifacts) &&
    typeof candidate.reused === 'boolean'
  );
}
