import { NotFoundException } from '@nestjs/common';

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { ObjectStorageService } from '../storage/object-storage.service';
import type { WorkerClientService } from '../worker-client/worker-client.service';
import { ArtifactDownloadService } from './artifact-download.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '33333333-3333-4333-8333-333333333333';
const ARTIFACT_ID = '44444444-4444-4444-8444-444444444444';
const WORKER_JOB_ID = 'abcdef0123456789abcdef0123456789';

function build(artifact: unknown): {
  service: ArtifactDownloadService;
  findFirst: jest.Mock;
  get: jest.Mock;
  fetchArtifact: jest.Mock;
} {
  const findFirst = jest.fn().mockResolvedValue(artifact);
  const get = jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7'));
  const fetchArtifact = jest.fn().mockResolvedValue(Buffer.from('PK'));

  const service = new ArtifactDownloadService(
    { artifact: { findFirst } } as unknown as PrismaService,
    { get } as unknown as ObjectStorageService,
    { fetchArtifact } as unknown as WorkerClientService,
  );
  return { service, findFirst, get, fetchArtifact };
}

describe('ArtifactDownloadService', () => {
  it('sirve la clave con intento y también la anterior, que no lo lleva', async () => {
    const ATTEMPT_ID = '55555555-5555-4555-8555-555555555555';

    // Formato actual: el intento va en la clave porque `job_id` se repite al
    // reprocesar el mismo documento y `object_key` es único en la tabla.
    const conIntento = build({
      kind: 'RESULT_XLSX',
      objectKey: `worker/${ORGANIZATION_ID}/${WORKER_JOB_ID}/${ATTEMPT_ID}/statement.xlsx`,
    });
    await conIntento.service.download(ORGANIZATION_ID, JOB_ID, ARTIFACT_ID);
    expect(conIntento.fetchArtifact).toHaveBeenCalledWith(WORKER_JOB_ID, 'statement.xlsx');
    expect(conIntento.get).not.toHaveBeenCalled();

    // Formato anterior: las filas ya guardadas deben seguir descargándose.
    const sinIntento = build({
      kind: 'RESULT_XLSX',
      objectKey: `worker/${ORGANIZATION_ID}/${WORKER_JOB_ID}/statement.xlsx`,
    });
    await sinIntento.service.download(ORGANIZATION_ID, JOB_ID, ARTIFACT_ID);
    expect(sinIntento.fetchArtifact).toHaveBeenCalledWith(WORKER_JOB_ID, 'statement.xlsx');
    expect(sinIntento.get).not.toHaveBeenCalled();
  });

  it('exige que el artefacto pertenezca al trabajo y a la organización', async () => {
    const { service, findFirst } = build({
      kind: 'RESULT_XLSX',
      objectKey: `worker/${ORGANIZATION_ID}/${WORKER_JOB_ID}/statement.xlsx`,
    });

    await service.download(ORGANIZATION_ID, JOB_ID, ARTIFACT_ID);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ARTIFACT_ID,
          organizationId: ORGANIZATION_ID,
          jobAttempt: { jobId: JOB_ID, organizationId: ORGANIZATION_ID },
        },
      }),
    );
  });

  it('lee el PDF de origen del almacenamiento propio', async () => {
    const { service, get, fetchArtifact } = build({
      kind: 'SOURCE_PDF',
      objectKey: 'organizations/o/statements/s/objeto.pdf',
    });

    const result = await service.download(ORGANIZATION_ID, JOB_ID, ARTIFACT_ID);

    expect(get).toHaveBeenCalledWith('organizations/o/statements/s/objeto.pdf');
    expect(fetchArtifact).not.toHaveBeenCalled();
    expect(result.contentType).toBe('application/pdf');
  });

  it('pide al worker los artefactos que él publicó', async () => {
    const { service, fetchArtifact, get } = build({
      kind: 'RESULT_XLSX',
      objectKey: `worker/${ORGANIZATION_ID}/${WORKER_JOB_ID}/statement.xlsx`,
    });

    const result = await service.download(ORGANIZATION_ID, JOB_ID, ARTIFACT_ID);

    expect(fetchArtifact).toHaveBeenCalledWith(WORKER_JOB_ID, 'statement.xlsx');
    expect(get).not.toHaveBeenCalled();
    expect(result.contentType).toContain('spreadsheetml');
  });

  it('nombra la descarga por el trabajo y el tipo, nunca por el documento original', async () => {
    const { service } = build({
      kind: 'RESULT_CSV',
      objectKey: `worker/${ORGANIZATION_ID}/${WORKER_JOB_ID}/statement_Movimientos.csv`,
    });

    const result = await service.download(ORGANIZATION_ID, JOB_ID, ARTIFACT_ID);

    expect(result.fileName).toBe(`${JOB_ID}.csv`);
    expect(result.fileName).not.toContain('statement');
  });

  it('devuelve 404 cuando el artefacto no existe o es de otra organización', async () => {
    const { service, get, fetchArtifact } = build(null);

    await expect(service.download(ORGANIZATION_ID, JOB_ID, ARTIFACT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(get).not.toHaveBeenCalled();
    expect(fetchArtifact).not.toHaveBeenCalled();
  });

  it('rechaza una clave de worker que no cumple el formato esperado', async () => {
    const { service, get } = build({
      kind: 'RESULT_XLSX',
      objectKey: 'worker/../../etc/passwd',
    });

    await service.download(ORGANIZATION_ID, JOB_ID, ARTIFACT_ID);

    // Una clave que no encaja con el patrón del worker se trata como objeto propio,
    // y el almacenamiento rechaza cualquier ruta que escape de su raíz.
    expect(get).toHaveBeenCalledWith('worker/../../etc/passwd');
  });
});

describe('ArtifactDownloadService ante objetos ausentes', () => {
  it('devuelve 404 en vez de 500 cuando el objeto no está en el almacenamiento', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      kind: 'SOURCE_PDF',
      objectKey: 'organizations/o/statements/s/objeto.pdf',
    });
    const get = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }));
    const service = new ArtifactDownloadService(
      { artifact: { findFirst } } as unknown as PrismaService,
      { get } as unknown as ObjectStorageService,
      { fetchArtifact: jest.fn() } as unknown as WorkerClientService,
    );

    await expect(service.download(ORGANIZATION_ID, JOB_ID, ARTIFACT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('trata una clave de una versión anterior como artefacto no disponible', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      kind: 'RESULT_XLSX',
      objectKey: `worker/${WORKER_JOB_ID}/statement.xlsx`,
    });
    const get = jest.fn().mockRejectedValue(new Error('ENOENT'));
    const fetchArtifact = jest.fn();
    const service = new ArtifactDownloadService(
      { artifact: { findFirst } } as unknown as PrismaService,
      { get } as unknown as ObjectStorageService,
      { fetchArtifact } as unknown as WorkerClientService,
    );

    await expect(service.download(ORGANIZATION_ID, JOB_ID, ARTIFACT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(fetchArtifact).not.toHaveBeenCalled();
  });
});
