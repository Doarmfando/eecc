import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';

import type { RequestWithContext } from './request-context';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Trazabilidad sin PII: un identificador opaco por petición. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithContext, response: Response, next: NextFunction): void {
    const incoming = request.header(REQUEST_ID_HEADER);
    const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
