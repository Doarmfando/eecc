import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchJob, uploadStatement, type ApiClientOptions } from './api-client';
import { ApiError } from './api-error';

const OPTIONS: ApiClientOptions = { baseUrl: 'http://127.0.0.1:3000' };

const JOB = {
  jobId: '33333333-3333-4333-8333-333333333333',
  statementId: '22222222-2222-4222-8222-222222222222',
  status: 'NEEDS_REVIEW',
  attemptNumber: 1,
  extractorId: 'bcp-coordinate-v1',
  extractorVersion: '0.1.0',
  rowCount: 12,
  movementCount: 8,
  pageCount: 2,
  warningCodes: ['BCP_AMOUNT_UNPARSEABLE'],
  checks: [{ code: 'BCP_PAGE_TOTALS', status: 'FAILED' }],
  artifacts: [{ id: 'artifact-id', kind: 'RESULT_XLSX', byteSize: 2048, name: 'statement.xlsx' }],
  reused: false,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const mock =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadStatement', () => {
  it('envía el documento con la sesión y devuelve el trabajo validado', async () => {
    const fetchMock = mockFetch(jsonResponse(201, JOB));

    const job = await uploadStatement(OPTIONS, {
      file: new File(['%PDF-1.7'], 'estado.pdf', { type: 'application/pdf' }),
      defaultYear: 2026,
      idempotencyKey: 'clave-de-prueba-1234',
    });

    expect(job.status).toBe('NEEDS_REVIEW');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:3000/v1/statements');
    expect(init.method).toBe('POST');
    // La sesión viaja en la cookie httpOnly, que este código no puede leer: lo
    // comprobable es que la petición se haga con credenciales.
    expect(init.credentials).toBe('include');
    const headers = init.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBe('clave-de-prueba-1234');
    const body = init.body as FormData;
    expect(body.get('defaultYear')).toBe('2026');
    expect(body.get('document')).toBeInstanceOf(File);
  });

  it('traduce el error del servidor a un ApiError con su código y referencia', async () => {
    mockFetch(jsonResponse(422, { code: 'UNSUPPORTED_DOCUMENT', requestId: 'req-123' }));

    const error = await uploadStatement(OPTIONS, {
      file: new File(['x'], 'estado.pdf'),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('UNSUPPORTED_DOCUMENT');
    expect((error as ApiError).requestId).toBe('req-123');
    expect((error as ApiError).httpStatus).toBe(422);
  });

  it('no propaga detalles de red y usa un código propio', async () => {
    mockFetch(new TypeError('Failed to fetch http://interno:3000'));

    const error = await uploadStatement(OPTIONS, {
      file: new File(['x'], 'estado.pdf'),
    }).catch((caught: unknown) => caught);

    expect((error as ApiError).code).toBe('NETWORK_ERROR');
    expect((error as ApiError).message).not.toContain('interno');
  });

  it('rechaza una respuesta que no cumple el contrato', async () => {
    mockFetch(jsonResponse(201, { jobId: 'solo-esto' }));

    const error = await uploadStatement(OPTIONS, {
      file: new File(['x'], 'estado.pdf'),
    }).catch((caught: unknown) => caught);

    expect((error as ApiError).code).toBe('RESPONSE_CONTRACT_MISMATCH');
  });
});

describe('fetchJob', () => {
  it('consulta el trabajo por identificador escapado', async () => {
    const fetchMock = mockFetch(jsonResponse(200, JOB));

    await fetchJob(OPTIONS, 'id con espacio');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://127.0.0.1:3000/v1/jobs/id%20con%20espacio');
  });

  it('devuelve un error de contrato si el cuerpo del error es inesperado', async () => {
    mockFetch(new Response('no es json', { status: 500 }));

    const error = await fetchJob(OPTIONS, 'job-id').catch((caught: unknown) => caught);

    expect((error as ApiError).code).toBe('REQUEST_FAILED');
    expect((error as ApiError).httpStatus).toBe(500);
  });
});
