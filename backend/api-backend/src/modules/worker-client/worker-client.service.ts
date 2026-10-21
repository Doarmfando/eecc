import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/app-config';
import type {
  WorkerJobPayload,
  WorkerProcessRequest,
  WorkerWarningPage,
} from './worker-client.types';

const WORKER_ERROR_CODES = new Set([
  'INVALID_PDF',
  'PDF_PASSWORD_REQUIRED',
  'PDF_PASSWORD_INCORRECT',
  'PDF_SIZE_LIMIT_EXCEEDED',
  'UNSUPPORTED_DOCUMENT',
  'INVALID_JOB_OPTIONS',
  'STATEMENT_NOT_EXPORTABLE',
  'PDF_PAGE_LIMIT_EXCEEDED',
]);

export const PDF_PAGE_LIMIT_EXCEEDED = 'PDF_PAGE_LIMIT_EXCEEDED';

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
    if (request.pdfPassword !== undefined) {
      form.append('pdf_password', request.pdfPassword);
    }
    // Campo de texto UTF-8: el `filename` del multipart puede llegar como Latin-1.
    if (request.sourceFileName !== undefined) {
      form.append('source_file_name', request.sourceFileName);
    }
    if (request.maxPages !== undefined) {
      form.append('max_pages', String(request.maxPages));
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
        throw new UnprocessableEntityException({ code, ...readPageLimitMeta(code, body) });
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

  /**
   * Pide al worker que borre lo que publicó de un trabajo.
   *
   * No propaga el fallo: lo llama la limpieza, y que un descarte no salga no debe
   * impedir que se borre el resto. Queda en el registro para que se note el residuo.
   */
  async discardJob(workerJobId: string): Promise<boolean> {
    const baseUrl = this.config.get('WORKER_BASE_URL', { infer: true });
    const timeout = this.config.get('WORKER_TIMEOUT_MS', { infer: true });

    try {
      const response = await fetch(
        new URL(`/internal/statements/${encodeURIComponent(workerJobId)}`, baseUrl),
        { method: 'DELETE', signal: AbortSignal.timeout(timeout) },
      );
      if (!response.ok) {
        this.logger.warn(`El worker no descartó el trabajo: HTTP ${String(response.status)}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(`El worker no descartó el trabajo: ${describeNetworkError(error)}`);
      return false;
    }
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

/** Cuántas páginas tiene el PDF y cuántas admite el plan, para decirlo en el aviso. */
function readPageLimitMeta(
  code: string,
  body: unknown,
): { meta?: { pageCount: number; maxPages: number } } {
  if (code !== PDF_PAGE_LIMIT_EXCEEDED || typeof body !== 'object' || body === null) {
    return {};
  }
  const { page_count: pageCount, max_pages: maxPages } = body as Record<string, unknown>;
  if (Number.isSafeInteger(pageCount) && Number.isSafeInteger(maxPages)) {
    return { meta: { pageCount: pageCount as number, maxPages: maxPages as number } };
  }
  return {};
}

function readCode(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'code' in body) {
    const code = body.code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** Código corto y página positiva; cualquier otra forma hace incoherente la respuesta. */
function isWarningPages(value: unknown): value is WorkerWarningPage[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => {
      if (typeof item !== 'object' || item === null) {
        return false;
      }
      const { code, page } = item as Partial<WorkerWarningPage>;
      return (
        typeof code === 'string' &&
        code.length > 0 &&
        code.length <= 64 &&
        Number.isSafeInteger(page) &&
        (page ?? 0) > 0
      );
    })
  );
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
    (candidate.warning_pages === undefined || isWarningPages(candidate.warning_pages)) &&
    Array.isArray(candidate.checks) &&
    Array.isArray(candidate.artifacts) &&
    typeof candidate.reused === 'boolean'
  );
}
