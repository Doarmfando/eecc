import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { SanitizedExceptionFilter } from '../src/common/http/sanitized-exception.filter';
import { SESSION_COOKIE, hashSessionToken } from '../src/modules/auth/session-cookie';
import { ObjectStorageService } from '../src/modules/storage/object-storage.service';
import { WorkerClientService } from '../src/modules/worker-client/worker-client.service';

/**
 * Aislamiento multi-tenant contra PostgreSQL real.
 *
 * Se ejecuta solo con una base disponible y `RUN_DB_TESTS=1`, para que la suite
 * normal siga corriendo sin servicios externos:
 *   RUN_DB_TESTS=1 DATABASE_URL=postgresql://... npm test
 *
 * Crea sus propias organizaciones con prefijo reconocible y las borra al terminar.
 */
const ENABLED = process.env.RUN_DB_TESTS === '1';
const describeDatabase = ENABLED ? describe : describe.skip;

const PREFIX = 'prueba-aislamiento';
const PDF = Buffer.from('%PDF-1.7\nsintetico\n%%EOF', 'utf8');

interface Tenant {
  organizationId: string;
  token: string;
}

describeDatabase('Aislamiento multi-tenant (base real)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let alpha: Tenant;
  let beta: Tenant;
  let jobId: string;
  let artifactId: string;

  async function createTenant(name: string): Promise<Tenant> {
    const organization = await prisma.organization.create({
      data: { displayName: `${PREFIX}-${name}` },
    });
    const token = randomBytes(24).toString('base64url');
    await prisma.apiKey.create({
      data: {
        organizationId: organization.id,
        label: `${PREFIX}-${name}`,
        tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
      },
    });
    return { organizationId: organization.id, token };
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WorkerClientService)
      .useValue({
        // El worker deriva su identificador del contenido: dos documentos
        // distintos producen trabajos distintos.
        processStatement: jest.fn().mockImplementation(({ content }: { content: Buffer }) =>
          Promise.resolve({
            job_id: createHash('sha256').update(content).digest('hex').slice(0, 32),
            extractor_id: 'bcp-coordinate-v1',
            extractor_version: '0.1.0',
            status: 'SUCCEEDED',
            row_count: 4,
            movement_count: 1,
            page_count: 1,
            warning_codes: [],
            checks: [{ code: 'BCP_ROWS_PRESENT', status: 'PASSED' }],
            artifacts: [
              { kind: 'XLSX', name: 'statement.xlsx', byte_size: 10, checksum: 'a'.repeat(64) },
            ],
            reused: false,
          }),
        ),
        fetchArtifact: jest.fn().mockResolvedValue(Buffer.from([80, 75, 3, 4])),
      })
      .overrideProvider(ObjectStorageService)
      .useValue({
        buildObjectKey: (organizationId: string, statementId: string): string =>
          `organizations/${organizationId}/statements/${statementId}/objeto.pdf`,
        put: jest.fn().mockImplementation((objectKey: string) =>
          Promise.resolve({
            objectKey,
            byteSize: PDF.byteLength,
            checksum: 'b'.repeat(64),
          }),
        ),
        get: jest.fn().mockResolvedValue(PDF),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new SanitizedExceptionFilter());
    await app.init();

    alpha = await createTenant('alpha');
    beta = await createTenant('beta');

    const created = await request(app.getHttpServer())
      .post('/v1/statements')
      .set('x-api-key', alpha.token)
      .attach('document', PDF, 'estado.pdf')
      .expect(201);

    jobId = created.body.jobId as string;
    const workbook = (created.body.artifacts as { id: string; kind: string }[]).find(
      (artifact) => artifact.kind === 'RESULT_XLSX',
    );
    if (!workbook) {
      throw new Error('La carga inicial no publicó el Excel esperado');
    }
    artifactId = workbook.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { displayName: { startsWith: PREFIX } } });
    // Las cuentas no cuelgan de la organización: sin esto quedarían huérfanas.
    await prisma.user.deleteMany({ where: { emailNormalized: { startsWith: PREFIX } } });
    await prisma.$disconnect();
    await app?.close();
  });

  it('persiste el trabajo bajo la organización que lo creó', async () => {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    const attempts = await prisma.jobAttempt.findMany({ where: { jobId } });
    const artifacts = await prisma.artifact.findMany({ where: { jobAttemptId: attempts[0]?.id } });

    expect(job.organizationId).toBe(alpha.organizationId);
    expect(attempts).toHaveLength(1);
    expect(artifacts.length).toBeGreaterThanOrEqual(2);
    expect(artifacts.every((artifact) => artifact.organizationId === alpha.organizationId)).toBe(
      true,
    );
  });

  it('deja rastro de auditoría y un evento de outbox sin publicar', async () => {
    const audit = await prisma.auditEvent.findMany({
      where: { organizationId: alpha.organizationId },
    });
    const outbox = await prisma.outboxEvent.findMany({ where: { aggregateId: jobId } });

    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('statement.processed');
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.publishedAt).toBeNull();
  });

  it('oculta el trabajo de otra organización', async () => {
    await request(app.getHttpServer())
      .get(`/v1/jobs/${jobId}`)
      .set('x-api-key', alpha.token)
      .expect(200);

    const foreign = await request(app.getHttpServer())
      .get(`/v1/jobs/${jobId}`)
      .set('x-api-key', beta.token)
      .expect(404);

    expect(foreign.body.code).toBe('JOB_NOT_FOUND');
  });

  it('niega la descarga de un artefacto de otra organización', async () => {
    await request(app.getHttpServer())
      .get(`/v1/jobs/${jobId}/artifacts/${artifactId}/content`)
      .set('x-api-key', alpha.token)
      .expect(200);

    const foreign = await request(app.getHttpServer())
      .get(`/v1/jobs/${jobId}/artifacts/${artifactId}/content`)
      .set('x-api-key', beta.token)
      .expect(404);

    expect(foreign.body.code).toBe('ARTIFACT_NOT_FOUND');
  });

  it('la misma huella en otra organización produce un trabajo distinto', async () => {
    const betaJob = await request(app.getHttpServer())
      .post('/v1/statements')
      .set('x-api-key', beta.token)
      .attach('document', PDF, 'estado.pdf')
      .expect(201);

    expect(betaJob.body.jobId).not.toBe(jobId);

    const alphaStatement = await prisma.statement.findFirstOrThrow({
      where: { organizationId: alpha.organizationId },
    });
    const betaStatement = await prisma.statement.findFirstOrThrow({
      where: { organizationId: beta.organizationId },
    });

    // La huella lleva la organización en el HMAC: el mismo archivo no se correlaciona.
    expect(alphaStatement.contentFingerprint).not.toBe(betaStatement.contentFingerprint);
  });

  it('el historial solo muestra los trabajos de la organización', async () => {
    const mine = await request(app.getHttpServer())
      .get('/v1/jobs')
      .set('x-api-key', alpha.token)
      .expect(200);

    const ids = (mine.body.items as { jobId: string }[]).map((item) => item.jobId);
    expect(ids).toContain(jobId);

    const foreign = await request(app.getHttpServer())
      .get('/v1/jobs')
      .set('x-api-key', beta.token)
      .expect(200);

    const foreignIds = (foreign.body.items as { jobId: string }[]).map((item) => item.jobId);
    expect(foreignIds).not.toContain(jobId);
  });

  describe('dentro de una misma organización', () => {
    const PDF_COMPARTIDO = Buffer.from('%PDF-1.7\ncompartido\n%%EOF', 'utf8');

    async function entrarComo(nombre: string, role: 'ADMIN' | 'MEMBER'): Promise<string> {
      const user = await prisma.user.create({
        data: {
          emailNormalized: `${PREFIX}-${nombre}-${randomBytes(4).toString('hex')}@eecc.local`,
          displayName: `${PREFIX}-${nombre}`,
          status: 'ACTIVE',
        },
      });
      await prisma.organizationMembership.create({
        data: { organizationId: alpha.organizationId, userId: user.id, role },
      });
      const token = randomBytes(32).toString('base64url');
      await prisma.session.create({
        data: {
          userId: user.id,
          organizationId: alpha.organizationId,
          tokenHash: hashSessionToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      return `${SESSION_COOKIE}=${token}`;
    }

    async function subir(cookie: string, pdf: Buffer): Promise<string> {
      const respuesta = await request(app.getHttpServer())
        .post('/v1/statements')
        .set('Cookie', cookie)
        .attach('document', pdf, 'estado.pdf')
        .expect(201);
      expect(respuesta.body.reused).toBe(false);
      return respuesta.body.jobId as string;
    }

    async function historial(cookie: string): Promise<string[]> {
      const respuesta = await request(app.getHttpServer())
        .get('/v1/jobs')
        .set('Cookie', cookie)
        .expect(200);
      return (respuesta.body.items as { jobId: string }[]).map((item) => item.jobId);
    }

    it('cada persona ve solo sus documentos, sea usuario o administrador', async () => {
      const admin = await entrarComo('admin', 'ADMIN');
      const usuario = await entrarComo('usuario', 'MEMBER');

      const delAdmin = await subir(admin, PDF_COMPARTIDO);
      // El mismo PDF subido por otra persona no reutiliza el trabajo ajeno.
      const delUsuario = await subir(usuario, PDF_COMPARTIDO);
      expect(delUsuario).not.toBe(delAdmin);

      expect(await historial(usuario)).toEqual([delUsuario]);
      expect(await historial(admin)).toEqual([delAdmin]);

      // Lo subido por la credencial de servicio tampoco aparece a las personas,
      // ni lo de las personas a la credencial.
      const deServicio = await request(app.getHttpServer())
        .get('/v1/jobs')
        .set('x-api-key', alpha.token)
        .expect(200);
      const idsServicio = (deServicio.body.items as { jobId: string }[]).map((item) => item.jobId);
      expect(idsServicio).toContain(jobId);
      expect(idsServicio).not.toContain(delAdmin);
      expect(idsServicio).not.toContain(delUsuario);

      // Conocer el identificador no basta: detalle y descarga responden 404.
      const ajeno = await request(app.getHttpServer())
        .get(`/v1/jobs/${delAdmin}`)
        .set('Cookie', usuario)
        .expect(404);
      expect(ajeno.body.code).toBe('JOB_NOT_FOUND');

      const artefacto = await prisma.artifact.findFirstOrThrow({
        where: { jobAttempt: { jobId: delAdmin }, kind: 'RESULT_XLSX' },
      });
      await request(app.getHttpServer())
        .get(`/v1/jobs/${delAdmin}/artifacts/${artefacto.id}/content`)
        .set('Cookie', admin)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/v1/jobs/${delAdmin}/artifacts/${artefacto.id}/content`)
        .set('Cookie', usuario)
        .expect(404);
    });
  });

  it('rechaza dos trabajos con la misma clave de idempotencia en la organización', async () => {
    const first = await request(app.getHttpServer())
      .post('/v1/statements')
      .set('x-api-key', alpha.token)
      .set('idempotency-key', 'clave-repetida-0001')
      .attach('document', Buffer.from('%PDF-1.7\notro\n%%EOF'), 'otro.pdf')
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/v1/statements')
      .set('x-api-key', alpha.token)
      .set('idempotency-key', 'clave-repetida-0001')
      .attach('document', Buffer.from('%PDF-1.7\notro\n%%EOF'), 'otro.pdf')
      .expect(201);

    expect(second.body.jobId).toBe(first.body.jobId);
    expect(second.body.reused).toBe(true);
  });
});
