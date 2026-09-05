import type { ConfigService } from '@nestjs/config';

import { PersistenceMode, type AppConfig } from '../../config/app-config';
import type { JobListDto } from '../jobs/dto/job-list.dto';
import type { WorkerClientService } from '../worker-client/worker-client.service';
import type { WorkerJobPayload } from '../worker-client/worker-client.types';
import { EphemeralArtifactDownloadService } from './ephemeral-artifact-download.service';
import { EphemeralJobStore } from './ephemeral-job.store';
import { EphemeralJobsService } from './ephemeral-jobs.service';
import { EphemeralStatementsService } from './ephemeral-statements.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const WORKER_JOB_ID = 'a'.repeat(32);

/** Un PDF mínimo: solo tiene que superar la validación de firma y tamaño. */
function pdf(marker = 'x'): Buffer {
  return Buffer.from(`%PDF-1.7 ${marker}`);
}

function configFor(overrides: Record<string, unknown> = {}): ConfigService<AppConfig, true> {
  const values: Record<string, unknown> = {
    PERSISTENCE_MODE: PersistenceMode.Memory,
    MAX_UPLOAD_BYTES: 52428800,
    PROFILE_VERSION: 'bcp-2026.08',
    EPHEMERAL_MAX_JOBS: 25,
    EPHEMERAL_TTL_MINUTES: 60,
    ...overrides,
  };
  return { get: (key: string): unknown => values[key] } as unknown as ConfigService<
    AppConfig,
    true
  >;
}

function payload(overrides: Partial<WorkerJobPayload> = {}): WorkerJobPayload {
  return {
    job_id: WORKER_JOB_ID,
    extractor_id: 'bcp',
    extractor_version: '1.0.0',
    status: 'SUCCEEDED',
    row_count: 120,
    movement_count: 100,
    page_count: 4,
    warning_codes: ['DATE_INFERRED'],
    checks: [{ code: 'BALANCE', status: 'PASSED' }],
    artifacts: [
      { kind: 'XLSX', name: 'statement.xlsx', byte_size: 9, checksum: 'c1' },
      { kind: 'CSV', name: 'statement_Movimientos.csv', byte_size: 7, checksum: 'c2' },
    ],
    reused: false,
    ...overrides,
  };
}

interface Harness {
  statements: EphemeralStatementsService;
  jobs: EphemeralJobsService;
  downloads: EphemeralArtifactDownloadService;
  worker: {
    processStatement: jest.Mock;
    fetchArtifact: jest.Mock;
    discardJob: jest.Mock;
  };
}

function harness(config = configFor(), workerPayload = payload()): Harness {
  const worker = {
    processStatement: jest.fn().mockResolvedValue(workerPayload),
    fetchArtifact: jest
      .fn()
      .mockImplementation((_jobId: string, name: string) => Promise.resolve(Buffer.from(name))),
    discardJob: jest.fn().mockResolvedValue(true),
  };
  const store = new EphemeralJobStore(config);
  return {
    statements: new EphemeralStatementsService(
      worker as unknown as WorkerClientService,
      store,
      config,
    ),
    jobs: new EphemeralJobsService(store),
    downloads: new EphemeralArtifactDownloadService(store),
    worker,
  };
}

describe('EphemeralStatementsService', () => {
  it('devuelve el resultado sin conservar el PDF de origen', async () => {
    const { statements, worker } = harness();

    const job = await statements.process({
      organizationId: ORGANIZATION_ID,
      content: pdf(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
    });

    expect(job.status).toBe('SUCCEEDED');
    expect(job.movementCount).toBe(100);
    expect(job.warningCodes).toEqual(['DATE_INFERRED']);
    // Solo los dos resultados: el PDF de origen no llega a ser un artefacto.
    expect(job.artifacts.map((artifact) => artifact.kind)).toEqual(['RESULT_XLSX', 'RESULT_CSV']);
    expect(worker.fetchArtifact).toHaveBeenCalledTimes(2);
  });

  it('pide al worker que borre su copia una vez descargados los bytes', async () => {
    const { statements, worker } = harness();

    await statements.process({
      organizationId: ORGANIZATION_ID,
      content: pdf(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
    });

    expect(worker.discardJob).toHaveBeenCalledWith(WORKER_JOB_ID);
    const fetchOrder = worker.fetchArtifact.mock.invocationCallOrder;
    const discardOrder = worker.discardJob.mock.invocationCallOrder[0] ?? 0;
    expect(Math.max(...fetchOrder)).toBeLessThan(discardOrder);
  });

  it('no descarta la copia del worker si falla una descarga', async () => {
    const { statements, worker } = harness();
    worker.fetchArtifact.mockRejectedValueOnce(new Error('sin red'));

    await expect(
      statements.process({
        organizationId: ORGANIZATION_ID,
        content: pdf(),
        fileName: 'estado.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow();
    expect(worker.discardJob).not.toHaveBeenCalled();
  });

  it('reutiliza el trabajo del mismo documento sin volver a llamar al worker', async () => {
    const { statements, worker } = harness();
    const command = {
      organizationId: ORGANIZATION_ID,
      content: pdf(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
    };

    const first = await statements.process(command);
    const second = await statements.process({ ...command, content: pdf() });

    expect(second.jobId).toBe(first.jobId);
    expect(second.reused).toBe(true);
    expect(worker.processStatement).toHaveBeenCalledTimes(1);
  });

  it('rechaza lo que no es un PDF antes de llamar al worker', async () => {
    const { statements, worker } = harness();

    await expect(
      statements.process({
        organizationId: ORGANIZATION_ID,
        content: Buffer.from('no soy un pdf'),
        fileName: 'nota.txt',
        mimeType: 'application/pdf',
      }),
    ).rejects.toThrow();
    expect(worker.processStatement).not.toHaveBeenCalled();
  });
});

describe('lectura de trabajos en memoria', () => {
  it('entrega el contenido descargado y lo aísla por organización', async () => {
    const { statements, jobs, downloads } = harness();
    const job = await statements.process({
      organizationId: ORGANIZATION_ID,
      content: pdf(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
    });
    const xlsx = job.artifacts[0];
    expect(xlsx).toBeDefined();

    const downloaded = await downloads.download(ORGANIZATION_ID, job.jobId, xlsx?.id ?? '');
    expect(downloaded.content.toString()).toBe('statement.xlsx');
    expect(downloaded.fileName).toBe(`${job.jobId}.xlsx`);

    await expect(jobs.findOne(OTHER_ORGANIZATION_ID, job.jobId)).rejects.toThrow();
    await expect(
      downloads.download(OTHER_ORGANIZATION_ID, job.jobId, xlsx?.id ?? ''),
    ).rejects.toThrow();
  });

  it('lista el historial del más reciente al más antiguo', async () => {
    // El orden se decide por instante de creación y, en caso de empate, por
    // identificador: el mismo criterio que `ORDER BY created_at DESC, id DESC`.
    // Separar los instantes evita depender del desempate, que es arbitrario.
    jest.useFakeTimers();
    try {
      const { statements, jobs } = harness();
      const first = await statements.process({
        organizationId: ORGANIZATION_ID,
        content: pdf('uno'),
        fileName: 'uno.pdf',
        mimeType: 'application/pdf',
      });

      jest.setSystemTime(Date.now() + 1000);
      const second = await statements.process({
        organizationId: ORGANIZATION_ID,
        content: pdf('dos'),
        fileName: 'dos.pdf',
        mimeType: 'application/pdf',
      });

      const list = await jobs.list(ORGANIZATION_ID);
      expect(list.items.map((item) => item.jobId)).toEqual([second.jobId, first.jobId]);
      expect(list.items[0]?.artifactCount).toBe(2);
      expect(list.nextCursor).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('pagina con cursor sin repetir ni saltarse trabajos', async () => {
    const { statements, jobs } = harness();
    const created: string[] = [];
    for (const marker of ['uno', 'dos', 'tres']) {
      const job = await statements.process({
        organizationId: ORGANIZATION_ID,
        content: pdf(marker),
        fileName: `${marker}.pdf`,
        mimeType: 'application/pdf',
      });
      created.push(job.jobId);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: JobListDto = await jobs.list(ORGANIZATION_ID, {
        limit: 1,
        ...(cursor === null ? {} : { cursor }),
      });
      expect(page.items).toHaveLength(1);
      seen.push(...page.items.map((item) => item.jobId));
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(seen).toHaveLength(3);
    expect(new Set(seen)).toEqual(new Set(created));
  });

  it('olvida los trabajos que superan su tiempo de vida', async () => {
    jest.useFakeTimers();
    try {
      const { statements, jobs } = harness(configFor({ EPHEMERAL_TTL_MINUTES: 30 }));
      const job = await statements.process({
        organizationId: ORGANIZATION_ID,
        content: pdf(),
        fileName: 'estado.pdf',
        mimeType: 'application/pdf',
      });
      expect((await jobs.list(ORGANIZATION_ID)).items).toHaveLength(1);

      jest.setSystemTime(Date.now() + 31 * 60_000);

      expect((await jobs.list(ORGANIZATION_ID)).items).toEqual([]);
      await expect(jobs.findOne(ORGANIZATION_ID, job.jobId)).rejects.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });

  it('descarta los trabajos más antiguos al desbordar el cupo', async () => {
    const { statements, jobs } = harness(configFor({ EPHEMERAL_MAX_JOBS: 2 }));
    for (const marker of ['uno', 'dos', 'tres']) {
      await statements.process({
        organizationId: ORGANIZATION_ID,
        content: pdf(marker),
        fileName: `${marker}.pdf`,
        mimeType: 'application/pdf',
      });
    }

    const list = await jobs.list(ORGANIZATION_ID);
    expect(list.items).toHaveLength(2);
  });
});
