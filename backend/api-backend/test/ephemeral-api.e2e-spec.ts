import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response as SuperAgentResponse } from 'superagent';

// Debe evaluarse antes que `AppModule`: fija el entorno que valida `ConfigModule`.
import { EPHEMERAL_API_KEY } from './ephemeral-env';

import { AppModule } from '../src/app.module';
import { SanitizedExceptionFilter } from '../src/common/http/sanitized-exception.filter';
import { ObjectStorageService } from '../src/modules/storage/object-storage.service';
import { WorkerClientService } from '../src/modules/worker-client/worker-client.service';
import type { WorkerJobPayload } from '../src/modules/worker-client/worker-client.types';

const API_KEY = EPHEMERAL_API_KEY;
const PDF = Buffer.from('%PDF-1.7\nsintetico\n%%EOF', 'utf8');
const WORKER_JOB_ID = 'abcdef0123456789abcdef0123456789';
const XLSX_BYTES = Buffer.from([80, 75, 3, 4]);

const WORKER_PAYLOAD: WorkerJobPayload = {
  job_id: WORKER_JOB_ID,
  extractor_id: 'bcp-coordinate-v1',
  extractor_version: '0.1.0',
  status: 'NEEDS_REVIEW',
  row_count: 12,
  movement_count: 8,
  page_count: 2,
  warning_codes: ['BCP_AMOUNT_UNPARSEABLE'],
  checks: [{ code: 'BCP_PAGE_TOTALS', status: 'FAILED' }],
  artifacts: [{ kind: 'XLSX', name: 'statement.xlsx', byte_size: 4, checksum: 'a'.repeat(64) }],
  reused: false,
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

/**
 * La API completa con `PERSISTENCE_MODE=memory`.
 *
 * No se sustituye `PrismaService`: si algún camino intentara consultar la base
 * de datos, la petición fallaría al no haber conexión abierta. Y el doble de
 * almacenamiento existe solo para comprobar que nadie escribe en disco.
 */
describe('API pública sin persistencia (e2e)', () => {
  let app: INestApplication;
  let storagePut: jest.Mock;
  let discardJob: jest.Mock;

  beforeAll(async () => {
    storagePut = jest.fn();
    discardJob = jest.fn().mockResolvedValue(true);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WorkerClientService)
      .useValue({
        processStatement: jest.fn().mockResolvedValue(WORKER_PAYLOAD),
        fetchArtifact: jest.fn().mockResolvedValue(XLSX_BYTES),
        discardJob,
      })
      .overrideProvider(ObjectStorageService)
      .useValue({
        buildObjectKey: (): string => 'no-deberia-usarse',
        put: storagePut,
        get: jest.fn(),
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

  it('arranca sin abrir conexión a PostgreSQL', async () => {
    // Que `beforeAll` haya terminado ya es la prueba: `PrismaService.onModuleInit`
    // aborta el arranque si intenta conectarse y no hay servidor escuchando.
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('sigue exigiendo la credencial configurada', async () => {
    const anonymous = await request(app.getHttpServer())
      .post('/v1/statements')
      .attach('document', PDF, 'estado.pdf')
      .expect(401);
    expect(anonymous.body.code).toEqual('API_KEY_REQUIRED');

    const wrong = await request(app.getHttpServer())
      .post('/v1/statements')
      .set('x-api-key', 'z'.repeat(48))
      .attach('document', PDF, 'estado.pdf')
      .expect(401);
    expect(wrong.body.code).toEqual('API_KEY_INVALID');
  });

  it('procesa, consulta y descarga sin escribir en disco', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/statements')
      .set('x-api-key', API_KEY)
      .attach('document', PDF, 'estado.pdf')
      .expect(201);

    expect(created.body.status).toBe('NEEDS_REVIEW');
    expect(created.body.movementCount).toBe(8);
    expect(created.body.artifacts).toHaveLength(1);
    // El PDF de origen nunca llega al almacenamiento de objetos.
    expect(storagePut).not.toHaveBeenCalled();
    // Y el worker ya no conserva su copia de los resultados.
    expect(discardJob).toHaveBeenCalledWith(WORKER_JOB_ID);

    const jobId: string = created.body.jobId;
    const artifactId: string = created.body.artifacts[0].id;

    const fetched = await request(app.getHttpServer())
      .get(`/v1/jobs/${jobId}`)
      .set('x-api-key', API_KEY)
      .expect(200);
    expect(fetched.body.jobId).toBe(jobId);

    const history = await request(app.getHttpServer())
      .get('/v1/jobs')
      .set('x-api-key', API_KEY)
      .expect(200);
    expect(history.body.items.map((item: { jobId: string }) => item.jobId)).toContain(jobId);

    const download = await request(app.getHttpServer())
      .get(`/v1/jobs/${jobId}/artifacts/${artifactId}/content`)
      .set('x-api-key', API_KEY)
      .buffer(true)
      .parse(collectBinary)
      .expect(200);
    expect(Buffer.from(download.body as Buffer).equals(XLSX_BYTES)).toBe(true);
    expect(download.headers['content-disposition']).toContain(`${jobId}.xlsx`);
  });

  it('responde que no existe un trabajo de otra sesión', async () => {
    const missing = await request(app.getHttpServer())
      .get('/v1/jobs/55555555-5555-4555-8555-555555555555')
      .set('x-api-key', API_KEY)
      .expect(404);
    expect(missing.body.code).toEqual('JOB_NOT_FOUND');
  });
});
