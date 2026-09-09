import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response as SuperAgentResponse } from 'superagent';

import { AppModule } from '../src/app.module';
import { SanitizedExceptionFilter } from '../src/common/http/sanitized-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { hashApiKey } from '../src/common/security/api-key.guard';
import { ObjectStorageService } from '../src/modules/storage/object-storage.service';
import { WorkerClientService } from '../src/modules/worker-client/worker-client.service';
import type { WorkerJobPayload } from '../src/modules/worker-client/worker-client.types';

const API_KEY = 'e'.repeat(48);
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '33333333-3333-4333-8333-333333333333';
const ARTIFACT_ID = '44444444-4444-4444-8444-444444444444';
const PDF = Buffer.from('%PDF-1.7\nsintetico\n%%EOF', 'utf8');

const WORKER_PAYLOAD: WorkerJobPayload = {
  job_id: 'abcdef0123456789abcdef0123456789',
  extractor_id: 'bcp-coordinate-v1',
  extractor_version: '0.1.0',
  status: 'NEEDS_REVIEW',
  row_count: 12,
  movement_count: 8,
  page_count: 2,
  warning_codes: ['BCP_AMOUNT_UNPARSEABLE'],
  checks: [{ code: 'BCP_PAGE_TOTALS', status: 'FAILED' }],
  artifacts: [{ kind: 'XLSX', name: 'statement.xlsx', byte_size: 2048, checksum: 'a'.repeat(64) }],
  reused: false,
};

const ATTEMPT = {
  attemptNumber: 1,
  extractorId: 'bcp-coordinate-v1',
  extractorVersion: '0.1.0',
  rowCount: 12,
  movementCount: 8,
  pageCount: 2,
  checks: [{ code: 'BCP_PAGE_TOTALS', status: 'FAILED' }],
  warnings: [{ code: 'BCP_AMOUNT_UNPARSEABLE' }],
  artifacts: [
    {
      id: 'artifact-id',
      kind: 'RESULT_XLSX',
      byteSize: 2048,
      objectKey: 'worker/o/j/statement.xlsx',
    },
  ],
};

/** `supertest` no acumula cuerpos binarios por defecto. */
function collectBinary(
  response: SuperAgentResponse,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
}

function buildPrismaDouble(): PrismaService {
  const tx = {
    statement: { create: jest.fn().mockResolvedValue({ id: 'statement-id' }) },
    job: { create: jest.fn().mockResolvedValue({ id: JOB_ID }) },
    jobAttempt: {
      create: jest.fn().mockResolvedValue({ id: 'attempt-id' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(ATTEMPT),
    },
    jobWarning: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    artifact: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-id' }) },
    outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'outbox-id' }) },
  };

  return {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    // La retención busca, fuera de la transacción, los documentos que exceden el
    // cupo. Con la lista vacía no hay nada que retirar y esta prueba mide el alta.
    statement: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(
      async (handler: (client: typeof tx) => Promise<unknown>): Promise<unknown> => handler(tx),
    ),
    apiKey: {
      findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) =>
        where.tokenHash === hashApiKey(API_KEY)
          ? Promise.resolve({
              id: 'key-id',
              organizationId: ORGANIZATION_ID,
              status: 'ACTIVE',
              tokenHash: hashApiKey(API_KEY),
              organization: { status: 'ACTIVE' },
            })
          : Promise.resolve(null),
      ),
    },
    artifact: {
      findFirst: jest.fn(({ where }: { where: { id: string; organizationId: string } }) =>
        where.id === ARTIFACT_ID && where.organizationId === ORGANIZATION_ID
          ? Promise.resolve({
              kind: 'RESULT_XLSX',
              objectKey: `worker/${ORGANIZATION_ID}/${'a'.repeat(32)}/statement.xlsx`,
            })
          : Promise.resolve(null),
      ),
    },
    job: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([
        {
          id: JOB_ID,
          statementId: 'statement-id',
          status: 'NEEDS_REVIEW',
          createdAt: new Date('2026-08-26T10:00:00Z'),
          attempts: [
            {
              extractorId: 'bcp-coordinate-v1',
              movementCount: 8,
              _count: { warnings: 1, artifacts: 5 },
            },
          ],
        },
      ]),
      findFirst: jest.fn(({ where }: { where: { id: string; organizationId: string } }) =>
        where.id === JOB_ID && where.organizationId === ORGANIZATION_ID
          ? Promise.resolve({
              id: JOB_ID,
              statementId: 'statement-id',
              status: 'NEEDS_REVIEW',
              attempts: [ATTEMPT],
            })
          : Promise.resolve(null),
      ),
    },
  } as unknown as PrismaService;
}

describe('API pública (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(buildPrismaDouble())
      .overrideProvider(WorkerClientService)
      .useValue({
        processStatement: jest.fn().mockResolvedValue(WORKER_PAYLOAD),
        fetchArtifact: jest.fn().mockResolvedValue(Buffer.from([80, 75, 3, 4])),
      })
      .overrideProvider(ObjectStorageService)
      .useValue({
        buildObjectKey: (): string => 'organizations/o/statements/s/objeto.pdf',
        put: jest.fn().mockResolvedValue({
          objectKey: 'organizations/o/statements/s/objeto.pdf',
          byteSize: PDF.byteLength,
          checksum: 'b'.repeat(64),
        }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new SanitizedExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('responde la comprobación de vida sin prefijo de versión', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
  });

  it('exige sesión o credencial de servicio en los recursos de la organización', async () => {
    const anonymous = await request(app.getHttpServer())
      .post('/v1/statements')
      .attach('document', PDF, 'estado.pdf')
      .expect(401);
    expect(anonymous.body.code).toEqual('AUTHENTICATION_REQUIRED');

    const wrong = await request(app.getHttpServer())
      .get(`/v1/jobs/${JOB_ID}`)
      .set('x-api-key', 'z'.repeat(48))
      .expect(401);
    expect(wrong.body.code).toEqual('API_KEY_INVALID');
  });

  it('procesa un estado de cuenta y devuelve un resumen sin datos financieros', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/statements')
      .set('x-api-key', API_KEY)
      .set('x-request-id', 'req-abcdef123456')
      .attach('document', PDF, 'estado.pdf')
      .expect(201);

    expect(response.body.status).toEqual('NEEDS_REVIEW');
    expect(response.body.warningCodes).toEqual(['BCP_AMOUNT_UNPARSEABLE']);
    expect(response.body.checks).toEqual([{ code: 'BCP_PAGE_TOTALS', status: 'FAILED' }]);
    expect(response.body.artifacts).toEqual([
      { id: 'artifact-id', kind: 'RESULT_XLSX', byteSize: 2048, name: 'statement.xlsx' },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('objectKey');
    expect(JSON.stringify(response.body)).not.toContain('estado.pdf');
    expect(response.headers['x-request-id']).toEqual('req-abcdef123456');
  });

  it('rechaza una petición sin documento o con campos desconocidos', async () => {
    const missing = await request(app.getHttpServer())
      .post('/v1/statements')
      .set('x-api-key', API_KEY)
      .expect(400);
    expect(missing.body.code).toEqual('DOCUMENT_REQUIRED');

    const unknownField = await request(app.getHttpServer())
      .post('/v1/statements')
      .set('x-api-key', API_KEY)
      .field('campoDesconocido', 'x')
      .attach('document', PDF, 'estado.pdf')
      .expect(400);
    expect(unknownField.body.code).toEqual('VALIDATION_FAILED');
    expect(unknownField.body.details?.[0]).toContain('campoDesconocido');
  });

  it('valida la clave de idempotencia y el año declarado', async () => {
    const badKey = await request(app.getHttpServer())
      .post('/v1/statements')
      .set('x-api-key', API_KEY)
      .set('idempotency-key', 'corta')
      .attach('document', PDF, 'estado.pdf')
      .expect(400);
    expect(badKey.body.code).toEqual('INVALID_IDEMPOTENCY_KEY');

    const badYear = await request(app.getHttpServer())
      .post('/v1/statements')
      .set('x-api-key', API_KEY)
      .field('defaultYear', '1800')
      .attach('document', PDF, 'estado.pdf')
      .expect(400);
    expect(badYear.body.code).toEqual('VALIDATION_FAILED');
  });

  it('descarga un artefacto del trabajo con nombre derivado del servidor', async () => {
    const response = await request(app.getHttpServer())
      .get(`/v1/jobs/${JOB_ID}/artifacts/${ARTIFACT_ID}/content`)
      .set('x-api-key', API_KEY)
      .buffer(true)
      .parse(collectBinary)
      .expect(200);

    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect(response.headers['content-disposition']).toEqual(
      `attachment; filename="${JOB_ID}.xlsx"`,
    );
    expect(response.headers['cache-control']).toEqual('private, no-store');
    expect(Buffer.from(response.body as Buffer)).toEqual(Buffer.from([80, 75, 3, 4]));
  });

  it('niega la descarga de un artefacto ajeno o inexistente', async () => {
    const response = await request(app.getHttpServer())
      .get(`/v1/jobs/${JOB_ID}/artifacts/55555555-5555-4555-8555-555555555555/content`)
      .set('x-api-key', API_KEY)
      .expect(404);

    expect(response.body.code).toEqual('ARTIFACT_NOT_FOUND');

    await request(app.getHttpServer())
      .get(`/v1/jobs/${JOB_ID}/artifacts/${ARTIFACT_ID}/content`)
      .expect(401);
  });

  it('lista el historial de la organización', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/jobs')
      .set('x-api-key', API_KEY)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      jobId: JOB_ID,
      status: 'NEEDS_REVIEW',
      movementCount: 8,
      warningCount: 1,
      artifactCount: 5,
    });
    expect(response.body.nextCursor).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain('objectKey');
  });

  it('rechaza parámetros de paginación inválidos', async () => {
    const badLimit = await request(app.getHttpServer())
      .get('/v1/jobs?limit=500')
      .set('x-api-key', API_KEY)
      .expect(400);
    expect(badLimit.body.code).toEqual('VALIDATION_FAILED');

    const badCursor = await request(app.getHttpServer())
      .get('/v1/jobs?cursor=no%20valido')
      .set('x-api-key', API_KEY)
      .expect(400);
    expect(badCursor.body.code).toEqual('VALIDATION_FAILED');

    await request(app.getHttpServer()).get('/v1/jobs').expect(401);
  });

  it('consulta un trabajo de la organización y oculta los de otras', async () => {
    const found = await request(app.getHttpServer())
      .get(`/v1/jobs/${JOB_ID}`)
      .set('x-api-key', API_KEY)
      .expect(200);
    expect(found.body.jobId).toEqual(JOB_ID);

    const other = await request(app.getHttpServer())
      .get('/v1/jobs/44444444-4444-4444-8444-444444444444')
      .set('x-api-key', API_KEY)
      .expect(404);
    expect(other.body.code).toEqual('JOB_NOT_FOUND');

    const malformed = await request(app.getHttpServer())
      .get('/v1/jobs/no-es-uuid')
      .set('x-api-key', API_KEY)
      .expect(400);
    expect(malformed.body.code).toEqual('VALIDATION_FAILED');
  });
});
