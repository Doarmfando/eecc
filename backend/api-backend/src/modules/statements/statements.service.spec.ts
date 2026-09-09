import { PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JobStatus } from '@prisma/client';

import type { AppConfig } from '../../config/app-config';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { ObjectStorageService } from '../storage/object-storage.service';
import type { WorkerClientService } from '../worker-client/worker-client.service';
import type { WorkerJobPayload } from '../worker-client/worker-client.types';
import type { StatementRetentionService } from './statement-retention.service';
import { StatementsService } from './statements.service';

const CONFIG: Record<string, unknown> = {
  MAX_UPLOAD_BYTES: 1024 * 1024,
  FINGERPRINT_SECRET: 'x'.repeat(48),
  PROFILE_VERSION: 'bcp-2026.08',
};

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

function pdfBuffer(marker = 'sintetico'): Buffer {
  return Buffer.from(`%PDF-1.7\n${marker}\n%%EOF`, 'utf8');
}

function workerPayload(overrides: Partial<WorkerJobPayload> = {}): WorkerJobPayload {
  return {
    job_id: 'abcdef0123456789abcdef0123456789',
    extractor_id: 'bcp-coordinate-v1',
    extractor_version: '0.1.0',
    status: 'SUCCEEDED',
    row_count: 4,
    movement_count: 1,
    page_count: 1,
    warning_codes: [],
    checks: [{ code: 'BCP_ROWS_PRESENT', status: 'PASSED' }],
    artifacts: [{ kind: 'XLSX', name: 'statement.xlsx', byte_size: 10, checksum: 'a'.repeat(64) }],
    reused: false,
    ...overrides,
  };
}

interface TransactionRecorder {
  created: { model: string; data: unknown }[];
}

function buildPrisma(
  existingJob: unknown,
  recorder: TransactionRecorder,
): { prisma: PrismaService; findUnique: jest.Mock } {
  const findUnique = jest.fn().mockResolvedValue(existingJob);
  const track =
    (model: string) =>
    (args: { data: unknown }): Promise<{ id: string }> => {
      recorder.created.push({ model, data: args.data });
      return Promise.resolve({ id: `${model}-id` });
    };

  const tx = {
    statement: { create: jest.fn(track('statement')) },
    job: { create: jest.fn(track('job')) },
    jobAttempt: {
      create: jest.fn(track('jobAttempt')),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        attemptNumber: 1,
        extractorId: 'bcp-coordinate-v1',
        extractorVersion: '0.1.0',
        rowCount: 4,
        movementCount: 1,
        pageCount: 1,
        checks: [{ code: 'BCP_ROWS_PRESENT', status: 'PASSED' }],
        warnings: [],
        artifacts: [
          {
            id: 'artifact-id',
            kind: 'RESULT_XLSX',
            byteSize: 10,
            objectKey: 'worker/o/j/statement.xlsx',
          },
        ],
      }),
    },
    jobWarning: { createMany: jest.fn(track('jobWarning')) },
    artifact: { createMany: jest.fn(track('artifact')) },
    auditEvent: { create: jest.fn(track('auditEvent')) },
    outboxEvent: { create: jest.fn(track('outboxEvent')) },
  };

  const prisma = {
    job: { findUnique },
    $transaction: jest.fn(
      async (handler: (client: typeof tx) => Promise<unknown>): Promise<unknown> => handler(tx),
    ),
  } as unknown as PrismaService;

  return { prisma, findUnique };
}

function buildService(
  prisma: PrismaService,
  worker: Partial<WorkerClientService> = {},
): StatementsService {
  const storage = {
    buildObjectKey: jest.fn(() => 'organizations/o/statements/s/object.pdf'),
    put: jest.fn().mockResolvedValue({
      objectKey: 'organizations/o/statements/s/object.pdf',
      byteSize: 24,
      checksum: 'b'.repeat(64),
    }),
  } as unknown as ObjectStorageService;

  const config = {
    get: (key: string): unknown => CONFIG[key],
  } as unknown as ConfigService<AppConfig, true>;

  const workerClient = {
    processStatement: jest.fn().mockResolvedValue(workerPayload()),
    ...worker,
  } as unknown as WorkerClientService;

  // La retención se comprueba en su propia especificación; aquí solo se registra
  // que se invoca, para que este doble no la ejecute contra la base.
  const retention = {
    enforceForUploader: jest.fn().mockResolvedValue(0),
  } as unknown as StatementRetentionService;

  return new StatementsService(prisma, storage, workerClient, retention, config);
}

describe('StatementsService', () => {
  it('deriva una huella distinta por organización para el mismo archivo', () => {
    const recorder: TransactionRecorder = { created: [] };
    const service = buildService(buildPrisma(null, recorder).prisma);
    const content = pdfBuffer();

    const first = service.fingerprint(ORGANIZATION_ID, content);
    const second = service.fingerprint(OTHER_ORGANIZATION_ID, content);

    expect(first).toHaveLength(64);
    expect(first).not.toEqual(second);
    expect(service.fingerprint(ORGANIZATION_ID, content)).toEqual(first);
  });

  it('persiste intento, artefactos, auditoría y outbox en una sola transacción', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const service = buildService(prisma);

    const response = await service.process({
      organizationId: ORGANIZATION_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
      requestId: 'req-12345678',
    });

    expect(response.status).toEqual(JobStatus.SUCCEEDED);
    expect(response.reused).toBe(false);
    expect(response.checks).toEqual([{ code: 'BCP_ROWS_PRESENT', status: 'PASSED' }]);
    expect(recorder.created.map((entry) => entry.model)).toEqual([
      'statement',
      'job',
      'jobAttempt',
      'artifact',
      'auditEvent',
      'outboxEvent',
    ]);
  });

  it('guarda el PDF de origen y los artefactos del worker con su checksum', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const service = buildService(prisma);

    await service.process({
      organizationId: ORGANIZATION_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
    });

    const artifacts = recorder.created.find((entry) => entry.model === 'artifact')?.data as {
      objectKey: string;
      checksum: string;
    }[];
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]?.objectKey).not.toContain('estado.pdf');
    expect(artifacts[1]?.checksum).toEqual('a'.repeat(64));
  });

  it('no vuelve a llamar al worker cuando la clave de idempotencia ya existe', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(
      {
        id: 'job-id',
        statementId: 'statement-id',
        status: JobStatus.NEEDS_REVIEW,
        attempts: [
          {
            attemptNumber: 1,
            extractorId: 'bcp-coordinate-v1',
            extractorVersion: '0.1.0',
            rowCount: 4,
            movementCount: 1,
            pageCount: 1,
            checks: [{ code: 'BCP_PAGE_TOTALS', status: 'FAILED' }],
            warnings: [{ code: 'BCP_AMOUNT_UNPARSEABLE' }],
            artifacts: [],
          },
        ],
      },
      recorder,
    );
    const processStatement = jest.fn();
    const service = buildService(prisma, { processStatement });

    const response = await service.process({
      organizationId: ORGANIZATION_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
    });

    expect(processStatement).not.toHaveBeenCalled();
    expect(response.reused).toBe(true);
    expect(response.status).toEqual(JobStatus.NEEDS_REVIEW);
    expect(response.warningCodes).toEqual(['BCP_AMOUNT_UNPARSEABLE']);
    expect(recorder.created).toHaveLength(0);
  });

  it('rechaza cargas que no son PDF o superan el límite antes de llamar al worker', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const processStatement = jest.fn();
    const service = buildService(buildPrisma(null, recorder).prisma, { processStatement });

    await expect(
      service.process({
        organizationId: ORGANIZATION_ID,
        content: Buffer.from('no soy un pdf'),
        fileName: 'nota.txt',
        mimeType: 'text/plain',
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);

    await expect(
      service.process({
        organizationId: ORGANIZATION_ID,
        content: Buffer.from('texto plano disfrazado'),
        fileName: 'falso.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);

    await expect(
      service.process({
        organizationId: ORGANIZATION_ID,
        content: Buffer.alloc(2 * 1024 * 1024, 1),
        fileName: 'enorme.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    expect(processStatement).not.toHaveBeenCalled();
  });

  it('registra un resultado fallido sin artefactos de resultado', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const service = buildService(prisma, {
      processStatement: jest
        .fn()
        .mockResolvedValue(workerPayload({ status: 'FAILED', artifacts: [], row_count: 0 })),
    });

    await service.process({
      organizationId: ORGANIZATION_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
    });

    const attempt = recorder.created.find((entry) => entry.model === 'jobAttempt')?.data as {
      errorCode?: string;
    };
    const artifacts = recorder.created.find((entry) => entry.model === 'artifact')?.data as
      unknown[] | undefined;
    expect(attempt.errorCode).toEqual('EXTRACTION_FAILED');
    expect(artifacts).toHaveLength(1);
  });
});
