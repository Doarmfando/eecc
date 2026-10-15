import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

import type { RequestWithContext } from './request-context';

const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_ERROR = 500;

interface ErrorBody {
  code: string;
  requestId?: string;
  details?: string[];
}

/**
 * El cliente recibe códigos, nunca trazas, rutas ni contenido de documentos.
 */
@Catch()
export class SanitizedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SanitizedExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<RequestWithContext>();

    const status = exception instanceof HttpException ? exception.getStatus() : HTTP_INTERNAL_ERROR;
    const body: ErrorBody = { code: resolveErrorCode(exception) };
    if (request.requestId) {
      body.requestId = request.requestId;
    }
    const details = resolveValidationDetails(exception, status);
    if (details.length > 0) {
      body.details = details;
    }

    // Nunca pasar la excepción al logger: Prisma y los lectores pueden incluir
    // valores privados en el mensaje y en la primera línea de la traza.
    const diagnostic = `request_id=${request.requestId ?? 'desconocido'} status=${String(status)} code=${body.code} role=${request.organization?.role ?? (request.organization ? 'SERVICE' : 'UNAUTHENTICATED')}`;
    if (status >= HTTP_INTERNAL_ERROR) this.logger.error(diagnostic);
    else this.logger.warn(diagnostic);

    response.status(status).json(body);
  }
}

export function resolveErrorCode(exception: unknown): string {
  if (!(exception instanceof HttpException)) {
    return 'INTERNAL_ERROR';
  }
  const payload = exception.getResponse();
  if (
    typeof payload === 'object' &&
    'code' in payload &&
    typeof payload.code === 'string' &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(payload.code)
  ) {
    return payload.code;
  }
  return exception.getStatus() === HTTP_BAD_REQUEST ? 'VALIDATION_FAILED' : 'REQUEST_FAILED';
}

/** Los mensajes de validación describen campos del contrato, nunca su contenido. */
function resolveValidationDetails(exception: unknown, status: number): string[] {
  if (!(exception instanceof HttpException) || status !== HTTP_BAD_REQUEST) {
    return [];
  }
  const payload = exception.getResponse();
  if (typeof payload === 'object' && 'message' in payload && Array.isArray(payload.message)) {
    return payload.message.filter((item): item is string => typeof item === 'string');
  }
  return [];
}
