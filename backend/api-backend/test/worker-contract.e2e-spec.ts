import type { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { AppConfig } from '../src/config/app-config';
import { WorkerClientService } from '../src/modules/worker-client/worker-client.service';

/**
 * Contrato real entre NestJS y el worker Python.
 *
 * Se ejecuta solo cuando hay un worker levantado y un PDF sintético disponible:
 *   WORKER_LIVE_URL=http://127.0.0.1:8000 WORKER_LIVE_PDF=ruta.pdf npm test
 * Sin esas variables la suite se salta, para no exigir servicios en cada corrida.
 */
const LIVE_URL = process.env.WORKER_LIVE_URL;
const LIVE_PDF = process.env.WORKER_LIVE_PDF;
const describeLive = LIVE_URL && LIVE_PDF ? describe : describe.skip;

describeLive('Contrato con el worker en vivo', () => {
  function buildService(): WorkerClientService {
    const values: Record<string, unknown> = {
      WORKER_BASE_URL: LIVE_URL,
      WORKER_TIMEOUT_MS: 60000,
    };
    const config = {
      get: (key: string): unknown => values[key],
    } as unknown as ConfigService<AppConfig, true>;
    return new WorkerClientService(config);
  }

  it('procesa un estado de cuenta sintético y devuelve el contrato esperado', async () => {
    const payload = await buildService().processStatement({
      content: readFileSync(LIVE_PDF as string),
      fileName: 'estado-sintetico.pdf',
      requestId: 'req-contrato-0001',
    });

    expect(payload.status).toEqual('SUCCEEDED');
    expect(payload.extractor_id).toEqual('bcp-coordinate-v1');
    expect(payload.page_count).toBeGreaterThan(0);
    expect(payload.artifacts.length).toBeGreaterThan(0);
    for (const artifact of payload.artifacts) {
      expect(artifact.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.byte_size).toBeGreaterThan(0);
    }
    expect(payload.checks.every((check) => typeof check.code === 'string')).toBe(true);
  });

  it('entrega los artefactos publicados con el checksum que declaró', async () => {
    const service = buildService();
    const payload = await service.processStatement({
      content: readFileSync(LIVE_PDF as string),
      fileName: 'estado-sintetico.pdf',
    });

    for (const artifact of payload.artifacts) {
      const content = await service.fetchArtifact(payload.job_id, artifact.name);
      expect(createHash('sha256').update(content).digest('hex')).toEqual(artifact.checksum);
      expect(content.byteLength).toEqual(artifact.byte_size);
    }
  });

  it('no entrega un archivo que el manifiesto no declara', async () => {
    const service = buildService();
    const payload = await service.processStatement({
      content: readFileSync(LIVE_PDF as string),
      fileName: 'estado-sintetico.pdf',
    });

    await expect(service.fetchArtifact(payload.job_id, 'result.json')).rejects.toMatchObject({
      response: { code: 'ARTIFACT_NOT_FOUND' },
    });
  });

  it('rechaza un documento que no es un estado de cuenta compatible', async () => {
    await expect(
      buildService().processStatement({
        content: Buffer.from('%PDF-1.7 no es un estado de cuenta\n%%EOF'),
        fileName: 'invalido.pdf',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_PDF' } });
  });
});
