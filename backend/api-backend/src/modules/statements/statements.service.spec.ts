import {
  ForbiddenException,
  PayloadTooLargeException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JobStatus } from '@prisma/client';

import type { AppConfig } from '../../config/app-config';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { ObjectStorageService } from '../storage/object-storage.service';
import type { WorkerClientService } from '../worker-client/worker-client.service';
import type { WorkerJobPayload } from '../worker-client/worker-client.types';
import type { StatementRetentionService } from './statement-retention.service';
import type { StatementUsageService } from './statement-usage.service';
import { StatementsService } from './statements.service';

const CONFIG: Record<string, unknown> = {
  MAX_UPLOAD_BYTES: 1024 * 1024,
  FINGERPRINT_SECRET: 'x'.repeat(48),
  PROFILE_VERSION: 'bcp-2026.08',
};

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_STATEMENT_ID = '55555555-5555-4555-8555-555555555555';
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

const CREATED_AT = new Date('2026-10-17T05:30:00.000Z');

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
    (args: { data: unknown }): Promise<Record<string, unknown>> => {
      recorder.created.push({ model, data: args.data });
      // Se devuelve lo mismo que se guardó (status, finishedAt, pageCount...), no
      // solo el id: el servicio lee `attempt.status`/`attempt.finishedAt` del
      // intento recién creado para decidir si registra su consumo.
      const datos = typeof args.data === 'object' && args.data !== null ? args.data : {};
      return Promise.resolve({ ...datos, id: `${model}-id`, createdAt: CREATED_AT });
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
    pageConsumptionEntry: { create: jest.fn(track('pageConsumptionEntry')) },
  };

  const prisma = {
    job: { findUnique },
    statement: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditEvent: tx.auditEvent,
    $transaction: jest.fn(
      async (handler: (client: typeof tx) => Promise<unknown>): Promise<unknown> => handler(tx),
    ),
  } as unknown as PrismaService;

  return { prisma, findUnique };
}

function buildService(
  prisma: PrismaService,
  worker: Partial<WorkerClientService> = {},
  enforceForUploader: jest.Mock = jest.fn().mockResolvedValue([]),
  discardUnregisteredWorkerJob: jest.Mock = jest.fn().mockResolvedValue(undefined),
  usageOverrides: Partial<StatementUsageService> = {},
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
    enforceForUploader,
    discardUnregisteredWorkerJob,
  } as unknown as StatementRetentionService;

  // Igual que la retención: su propia especificación cubre el cálculo real. Por
  // defecto no limita nada, como las pruebas que no fijan un plan nuevo.
  const usage = {
    assertWithinMonthlyQuota: jest.fn().mockResolvedValue(undefined),
    assertTrialAvailable: jest.fn(),
    markTrialUsed: jest.fn().mockResolvedValue(undefined),
    ...usageOverrides,
  } as unknown as StatementUsageService;

  return new StatementsService(prisma, storage, workerClient, retention, usage, config);
}

describe('StatementsService', () => {
  it('audita un rechazo sin guardar documento, contraseña, nombre ni mensaje interno', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const rejection = new UnprocessableEntityException({ code: 'INVALID_PDF', message: 'privado' });
    const service = buildService(buildPrisma(null, recorder).prisma, {
      processStatement: jest.fn().mockRejectedValue(rejection),
    });
    const content = pdfBuffer('contenido privado');
    await expect(
      service.process({
        organizationId: ORGANIZATION_ID,
        userId: 'actor-id',
        content,
        fileName: 'nombre privado.pdf',
        mimeType: 'application/pdf',
        pdfPassword: 'contraseña privada',
        requestId: 'req-rejected',
      }),
    ).rejects.toBe(rejection);
    expect(recorder.created).toEqual([
      {
        model: 'auditEvent',
        data: {
          organizationId: ORGANIZATION_ID,
          actorUserId: 'actor-id',
          action: 'statement.request_failed',
          entityType: 'statement',
          requestId: 'req-rejected',
          metadata: { code: 'INVALID_PDF', byteSize: content.length },
        },
      },
    ]);
  });

  it('conserva el error original si falla la auditoría del rechazo', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    jest.spyOn(prisma.auditEvent, 'create').mockRejectedValue(new Error('base no disponible'));
    const rejection = new UnprocessableEntityException({ code: 'PDF_PASSWORD_REQUIRED' });
    const service = buildService(prisma, {
      processStatement: jest.fn().mockRejectedValue(rejection),
    });
    await expect(
      service.process({
        organizationId: ORGANIZATION_ID,
        content: pdfBuffer(),
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
      }),
    ).rejects.toBe(rejection);
  });
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
    expect(response).toMatchObject({ sourceFileName: 'estado.pdf' });
    expect(recorder.created.find((entry) => entry.model === 'statement')?.data).toMatchObject({
      sourceFileName: 'estado.pdf',
    });
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

  it('dice cuándo se convirtió y respeta el documento elegido para reemplazar', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const enforceForUploader = jest
      .fn()
      .mockResolvedValue([{ statementId: OTHER_STATEMENT_ID, sourceFileName: 'Julio.pdf' }]);
    const service = buildService(prisma, {}, enforceForUploader);

    const response = await service.process({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
      replaceStatementId: OTHER_STATEMENT_ID,
    });

    expect(response.createdAt).toBe('2026-10-17T05:30:00.000Z');
    // El recién subido se protege; el elegido se borra en lugar del más antiguo.
    expect(enforceForUploader).toHaveBeenCalledWith(ORGANIZATION_ID, USER_ID, {
      keepStatementId: 'statement-id',
      preferredStatementId: OTHER_STATEMENT_ID,
    });
    // La interfaz avisa qué se reemplazó: la persona lo eligió, pero ya no está.
    expect(response.replacedStatements).toEqual([
      { statementId: OTHER_STATEMENT_ID, sourceFileName: 'Julio.pdf' },
    ]);
  });

  it('reenvía la contraseña del PDF al worker sin guardarla en ninguna parte', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const processStatement = jest.fn().mockResolvedValue(workerPayload());
    const service = buildService(prisma, { processStatement });

    await service.process({
      organizationId: ORGANIZATION_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
      pdfPassword: 'clave-del-pdf-123',
    });

    expect(processStatement).toHaveBeenCalledWith(
      expect.objectContaining({ pdfPassword: 'clave-del-pdf-123' }),
    );
    expect(JSON.stringify(recorder.created)).not.toContain('clave-del-pdf-123');
  });

  it('manda al worker el nombre ya saneado para la columna Archivo del Excel', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const processStatement = jest.fn().mockResolvedValue(workerPayload());
    const service = buildService(prisma, { processStatement });

    await service.process({
      organizationId: ORGANIZATION_ID,
      content: pdfBuffer(),
      fileName: 'C:\\fakepath\\Cuenta sintética.pdf',
      mimeType: 'application/pdf',
    });

    expect(processStatement).toHaveBeenCalledWith(
      expect.objectContaining({ sourceFileName: 'Cuenta sintética.pdf' }),
    );
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

  it('guarda cada aviso ubicado con su página y el resto sin ella', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const service = buildService(prisma, {
      processStatement: jest.fn().mockResolvedValue(
        workerPayload({
          status: 'NEEDS_REVIEW',
          warning_codes: ['BCP_BALANCE_MISMATCH', 'BCP_PAGE_INCOMPLETE'],
          warning_pages: [{ code: 'BCP_PAGE_INCOMPLETE', page: 424 }],
        }),
      ),
    });

    await service.process({
      organizationId: ORGANIZATION_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
    });

    const warnings = recorder.created.find((entry) => entry.model === 'jobWarning')?.data;
    expect(warnings).toEqual([
      expect.objectContaining({ code: 'BCP_BALANCE_MISMATCH', page: null }),
      expect.objectContaining({ code: 'BCP_PAGE_INCOMPLETE', page: 424 }),
    ]);
  });

  it('no vuelve a llamar al worker cuando la clave de idempotencia ya existe', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(
      {
        id: 'job-id',
        statementId: 'statement-id',
        createdAt: CREATED_AT,
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
    expect(response).toMatchObject({ sourceFileName: 'estado.pdf' });
    expect(prisma.statement.updateMany).toHaveBeenCalledWith({
      where: { id: 'statement-id', organizationId: ORGANIZATION_ID, uploadedById: null },
      data: { sourceFileName: 'estado.pdf' },
    });
    expect(response.status).toEqual(JobStatus.NEEDS_REVIEW);
    expect(response.warningCodes).toEqual(['BCP_AMOUNT_UNPARSEABLE']);
    expect(recorder.created).toHaveLength(0);
  });

  it('no reutiliza el trabajo de otra persona que subió el mismo PDF', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma, findUnique } = buildPrisma(null, recorder);
    const service = buildService(prisma);
    const subir = (userId: string | null): Promise<unknown> =>
      service.process({
        organizationId: ORGANIZATION_ID,
        userId,
        content: pdfBuffer(),
        fileName: 'estado.pdf',
        mimeType: 'application/pdf',
      });

    await subir('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await subir('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    await subir(null);
    await subir('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    const claves = findUnique.mock.calls.map(
      (call) =>
        (call[0] as { where: { organizationId_idempotencyKey: { idempotencyKey: string } } }).where
          .organizationId_idempotencyKey.idempotencyKey,
    );
    expect(new Set(claves.slice(0, 3)).size).toBe(3);
    // La misma persona con el mismo documento sí da con su trabajo anterior.
    expect(claves[3]).toBe(claves[0]);
    expect(claves.every((clave) => clave.length <= 128)).toBe(true);
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

  it('aplica el tope técnico de la membresía al pedido que le hace al worker', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const processStatement = jest.fn().mockResolvedValue(workerPayload({ page_count: 12 }));
    const enforceForUploader = jest.fn().mockResolvedValue([]);
    const service = buildService(prisma, { processStatement }, enforceForUploader);

    await service.process({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
      maxPagesPerDocument: 15,
    });

    expect(processStatement).toHaveBeenCalledWith(expect.objectContaining({ maxPages: 15 }));
    // El cupo de documentos ya no viene de la membresía (ADR-0007): se aplica
    // sin pedirle un `limit`, y usa el suyo propio (`RETAINED_STATEMENTS_PER_USER`).
    expect(enforceForUploader).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      USER_ID,
      expect.not.objectContaining({ limit: expect.anything() }),
    );
  });

  it('sin límite de páginas no se lo pide al worker', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const processStatement = jest.fn().mockResolvedValue(workerPayload({ page_count: 400 }));
    const service = buildService(prisma, { processStatement });

    await service.process({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
      maxPagesPerDocument: null,
    });

    expect(processStatement.mock.calls[0]?.[0]).not.toHaveProperty('maxPages');
  });

  it('con tope de cobro mensual, el worker recibe lo que queda del mes, no el tope técnico (ADR-0018)', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const processStatement = jest.fn().mockResolvedValue(workerPayload({ page_count: 3 }));
    const assertWithinMonthlyQuota = jest.fn().mockResolvedValue(3);
    const service = buildService(prisma, { processStatement }, undefined, undefined, {
      assertWithinMonthlyQuota,
    });

    await service.process({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
      maxPagesPerDocument: 1000,
      monthlyPageQuota: 10,
    });

    expect(assertWithinMonthlyQuota).toHaveBeenCalledWith(ORGANIZATION_ID, USER_ID, {
      maxPagesPerDocument: 1000,
      monthlyPageQuota: 10,
    });
    expect(processStatement).toHaveBeenCalledWith(expect.objectContaining({ maxPages: 3 }));
  });

  it('registra el consumo aparte del intento, dentro de la misma transacción (ADR-0018, anexo)', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const processStatement = jest.fn().mockResolvedValue(workerPayload({ page_count: 6 }));
    const service = buildService(prisma, { processStatement });

    await service.process({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
    });

    const entrada = recorder.created.find((entry) => entry.model === 'pageConsumptionEntry')
      ?.data as Record<string, unknown>;
    expect(entrada).toMatchObject({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      pageCount: 6,
      countedStatus: 'SUCCEEDED',
    });
    // Referencia al intento recién creado, no un número inventado aparte.
    expect(entrada.jobAttemptId).toBe('jobAttempt-id');
    expect(entrada.statementId).toBe('statement-id');
  });

  it('no registra consumo de un intento fallido', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const processStatement = jest
      .fn()
      .mockResolvedValue(workerPayload({ status: 'FAILED', page_count: 9 }));
    const service = buildService(prisma, { processStatement });

    await service.process({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
    });

    expect(recorder.created.some((entry) => entry.model === 'pageConsumptionEntry')).toBe(false);
  });

  it('una credencial de servicio (sin usuario) no registra consumo', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const processStatement = jest.fn().mockResolvedValue(workerPayload({ page_count: 4 }));
    const service = buildService(prisma, { processStatement });

    await service.process({
      organizationId: ORGANIZATION_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
    });

    expect(recorder.created.some((entry) => entry.model === 'pageConsumptionEntry')).toBe(false);
  });

  it('agotado el acumulado del mes, rechaza sin llegar a llamar al worker (ADR-0018)', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const processStatement = jest.fn();
    const assertWithinMonthlyQuota = jest.fn().mockRejectedValue(
      new UnprocessableEntityException({
        code: 'MONTHLY_PAGE_QUOTA_EXCEEDED',
        meta: { used: 10, quota: 10 },
      }),
    );
    const service = buildService(prisma, { processStatement }, undefined, undefined, {
      assertWithinMonthlyQuota,
    });

    await expect(
      service.process({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        content: pdfBuffer(),
        fileName: 'estado.pdf',
        mimeType: 'application/pdf',
        maxPagesPerDocument: 1000,
        monthlyPageQuota: 10,
      }),
    ).rejects.toMatchObject({
      response: { code: 'MONTHLY_PAGE_QUOTA_EXCEEDED', meta: { used: 10, quota: 10 } },
    });
    expect(processStatement).not.toHaveBeenCalled();
  });

  it('una conversión nueva con prueba única marca la prueba como gastada; reutilizar una ya subida no (ADR-0018)', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma, findUnique } = buildPrisma(null, recorder);
    const processStatement = jest.fn().mockResolvedValue(workerPayload({ page_count: 2 }));
    const markTrialUsed = jest.fn().mockResolvedValue(undefined);
    const service = buildService(prisma, { processStatement }, undefined, undefined, {
      markTrialUsed,
    });

    await service.process({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
      maxPagesPerDocument: 1000,
      monthlyPageQuota: 3,
      trialOneTime: true,
      trialAvailable: true,
    });

    expect(markTrialUsed).toHaveBeenCalledWith(ORGANIZATION_ID, USER_ID);

    markTrialUsed.mockClear();
    findUnique.mockResolvedValue({
      id: 'job-id',
      statementId: 'statement-id',
      createdAt: CREATED_AT,
      status: JobStatus.SUCCEEDED,
      attempts: [
        {
          attemptNumber: 1,
          extractorId: 'bcp-coordinate-v1',
          extractorVersion: '0.1.0',
          rowCount: 4,
          movementCount: 1,
          pageCount: 2,
          checks: [{ code: 'BCP_ROWS_PRESENT', status: 'PASSED' }],
          warnings: [],
          artifacts: [],
        },
      ],
    });

    await service.process({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      content: pdfBuffer(),
      fileName: 'estado.pdf',
      mimeType: 'application/pdf',
      maxPagesPerDocument: 1000,
      monthlyPageQuota: 3,
      trialOneTime: true,
      trialAvailable: true,
    });

    expect(markTrialUsed).not.toHaveBeenCalled();
  });

  it('si la prueba única ya se gastó, rechaza antes de llamar al worker (ADR-0018)', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const processStatement = jest.fn();
    const assertTrialAvailable = jest.fn().mockImplementation(() => {
      throw new ForbiddenException({ code: 'TRIAL_ALREADY_USED' });
    });
    const service = buildService(prisma, { processStatement }, undefined, undefined, {
      assertTrialAvailable,
    });

    await expect(
      service.process({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        content: pdfBuffer(),
        fileName: 'estado.pdf',
        mimeType: 'application/pdf',
        maxPagesPerDocument: 1000,
        monthlyPageQuota: 3,
        trialOneTime: true,
        trialAvailable: false,
      }),
    ).rejects.toMatchObject({ response: { code: 'TRIAL_ALREADY_USED' } });
    expect(assertTrialAvailable).toHaveBeenCalledWith(true, false);
    expect(processStatement).not.toHaveBeenCalled();
  });

  it('si el worker no aplicó el límite, la API no registra el documento y lo descarta', async () => {
    // Un worker anterior ignora `max_pages`: el límite del plan no puede depender
    // de que el otro lado lo cumpla.
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const discard = jest.fn().mockResolvedValue(undefined);
    const enforceForUploader = jest.fn().mockResolvedValue([]);
    const service = buildService(
      prisma,
      { processStatement: jest.fn().mockResolvedValue(workerPayload({ page_count: 40 })) },
      enforceForUploader,
      discard,
    );

    await expect(
      service.process({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        content: pdfBuffer(),
        fileName: 'estado.pdf',
        mimeType: 'application/pdf',
        maxPagesPerDocument: 15,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PDF_PAGE_LIMIT_EXCEEDED', meta: { pageCount: 40, maxPages: 15 } },
    });
    expect(discard).toHaveBeenCalledWith(workerPayload().job_id);
    expect(recorder.created.find((entry) => entry.model === 'statement')).toBeUndefined();
    expect(enforceForUploader).not.toHaveBeenCalled();
  });

  it('con la membresía vencida no convierte, no llama al worker y lo audita', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const processStatement = jest.fn();
    const service = buildService(prisma, { processStatement });

    await expect(
      service.process({
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        content: pdfBuffer(),
        fileName: 'estado.pdf',
        mimeType: 'application/pdf',
        membershipExpired: true,
      }),
    ).rejects.toMatchObject({ response: { code: 'MEMBERSHIP_EXPIRED' } });
    expect(processStatement).not.toHaveBeenCalled();
    const auditoria = recorder.created.find((entry) => entry.model === 'auditEvent')?.data as {
      action: string;
      metadata: { code: string };
    };
    expect(auditoria).toMatchObject({
      action: 'statement.request_failed',
      metadata: { code: 'MEMBERSHIP_EXPIRED' },
    });
  });

  it('borra documentos propios del historial y lo audita sin nombres', async () => {
    const recorder: TransactionRecorder = { created: [] };
    const { prisma } = buildPrisma(null, recorder);
    const removeOwn = jest
      .fn()
      .mockResolvedValueOnce([{ statementId: OTHER_STATEMENT_ID, sourceFileName: 'Junio.pdf' }])
      .mockResolvedValueOnce([]);
    const retention = { removeOwn } as unknown as StatementRetentionService;
    const service = new StatementsService(
      prisma,
      {} as ObjectStorageService,
      {} as WorkerClientService,
      retention,
      {} as StatementUsageService,
      { get: (key: string): unknown => CONFIG[key] } as unknown as ConfigService<AppConfig, true>,
    );

    await expect(
      service.deleteOwn(ORGANIZATION_ID, USER_ID, OTHER_STATEMENT_ID, 'req-borrar'),
    ).resolves.toEqual({ deletedCount: 1 });
    expect(removeOwn).toHaveBeenCalledWith(ORGANIZATION_ID, USER_ID, OTHER_STATEMENT_ID);
    const evento = recorder.created.find((entry) => entry.model === 'auditEvent')?.data;
    expect(evento).toMatchObject({
      action: 'statement.deleted',
      entityId: OTHER_STATEMENT_ID,
      requestId: 'req-borrar',
      metadata: { count: 1, scope: 'one' },
    });
    expect(JSON.stringify(evento)).not.toContain('Junio');

    // Repetir: ya no está, no falla y no audita de nuevo (idempotente).
    recorder.created.length = 0;
    await expect(service.deleteOwn(ORGANIZATION_ID, USER_ID)).resolves.toEqual({
      deletedCount: 0,
    });
    expect(recorder.created).toHaveLength(0);
  });
});
