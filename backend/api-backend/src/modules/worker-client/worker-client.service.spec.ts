import {
  BadGatewayException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/app-config';
import { WorkerClientService } from './worker-client.service';

const CONFIG: Record<string, unknown> = {
  WORKER_BASE_URL: 'http://127.0.0.1:8000',
  WORKER_TIMEOUT_MS: 5000,
};

function buildService(): WorkerClientService {
  const config = {
    get: (key: string): unknown => CONFIG[key],
  } as unknown as ConfigService<AppConfig, true>;
  return new WorkerClientService(config);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const PAYLOAD = {
  job_id: 'abcdef0123456789abcdef0123456789',
  extractor_id: 'bcp-coordinate-v1',
  extractor_version: '0.1.0',
  status: 'SUCCEEDED',
  row_count: 4,
  movement_count: 1,
  page_count: 1,
  warning_codes: [],
  checks: [],
  artifacts: [],
  reused: false,
};

describe('WorkerClientService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('envía el documento y devuelve el payload del worker', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, PAYLOAD));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await buildService().processStatement({
      content: Buffer.from('%PDF-1.7'),
      fileName: 'estado.pdf',
      requestId: 'req-1234567890',
    });

    expect(result.job_id).toEqual(PAYLOAD.job_id);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toEqual('http://127.0.0.1:8000/internal/statements');
    expect(init.method).toEqual('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('traduce los códigos de dominio del worker a 422', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(422, { code: 'INVALID_PDF' })) as unknown as typeof fetch;

    await expect(
      buildService().processStatement({ content: Buffer.from('x'), fileName: 'e.pdf' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('convierte un worker caído o incoherente en 502', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(
      buildService().processStatement({ content: Buffer.from('x'), fileName: 'e.pdf' }),
    ).rejects.toBeInstanceOf(BadGatewayException);

    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { job_id: 'incompleto' })) as unknown as typeof fetch;
    await expect(
      buildService().processStatement({ content: Buffer.from('x'), fileName: 'e.pdf' }),
    ).rejects.toBeInstanceOf(BadGatewayException);

    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(500, { detail: 'boom' })) as unknown as typeof fetch;
    await expect(
      buildService().processStatement({ content: Buffer.from('x'), fileName: 'e.pdf' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe('WorkerClientService.fetchArtifact', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('descarga el artefacto por su nombre publicado', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(new Uint8Array([80, 75, 3, 4]), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const content = await buildService().fetchArtifact('a'.repeat(32), 'statement.xlsx');

    expect(content).toEqual(Buffer.from([80, 75, 3, 4]));
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.toString()).toEqual(
      `http://127.0.0.1:8000/internal/statements/${'a'.repeat(32)}/artifacts/statement.xlsx`,
    );
  });

  it('traduce un artefacto inexistente a 404 y otros fallos a 502', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(
      buildService().fetchArtifact('a'.repeat(32), 'result.json'),
    ).rejects.toBeInstanceOf(NotFoundException);

    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(new Response('', { status: 500 })) as unknown as typeof fetch;
    await expect(buildService().fetchArtifact('a'.repeat(32), 'x.xlsx')).rejects.toBeInstanceOf(
      BadGatewayException,
    );

    globalThis.fetch = jest.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    await expect(buildService().fetchArtifact('a'.repeat(32), 'x.xlsx')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
