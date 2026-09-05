import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

import { SanitizedExceptionFilter } from './sanitized-exception.filter';

function hostFor(requestId?: string): {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: (): { getResponse: () => unknown; getRequest: () => unknown } => ({
      getResponse: (): unknown => ({ status }),
      getRequest: (): unknown => (requestId === undefined ? {} : { requestId }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('SanitizedExceptionFilter', () => {
  it('usa el código de dominio y adjunta la referencia de la petición', () => {
    const { host, status, json } = hostFor('req-123');

    new SanitizedExceptionFilter().catch(new NotFoundException({ code: 'JOB_NOT_FOUND' }), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ code: 'JOB_NOT_FOUND', requestId: 'req-123' });
  });

  it('omite la referencia cuando la petición no la trae', () => {
    const { host, json } = hostFor();

    new SanitizedExceptionFilter().catch(new NotFoundException({ code: 'JOB_NOT_FOUND' }), host);

    expect(json).toHaveBeenCalledWith({ code: 'JOB_NOT_FOUND' });
  });

  it('resume los errores de validación sin exponer valores enviados', () => {
    const { host, json } = hostFor('req-1');

    new SanitizedExceptionFilter().catch(
      new BadRequestException({ message: ['campo x no permitido', 42] }),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      code: 'VALIDATION_FAILED',
      requestId: 'req-1',
      details: ['campo x no permitido'],
    });
  });

  it('convierte cualquier error no controlado en 500 sin filtrar la traza', () => {
    const { host, status, json } = hostFor('req-2');

    new SanitizedExceptionFilter().catch(new Error('ENOENT: C:/ruta/interna'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ code: 'INTERNAL_ERROR', requestId: 'req-2' });
  });

  it('usa un código genérico cuando la excepción no declara uno', () => {
    const { host, json } = hostFor('req-3');

    new SanitizedExceptionFilter().catch(new HttpException('sin código', 418), host);

    expect(json).toHaveBeenCalledWith({ code: 'REQUEST_FAILED', requestId: 'req-3' });
  });
});
