import { NotFoundException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';

import type { PrismaService } from '../../common/prisma/prisma.service';
import { encodeJobCursor } from './job-cursor';
import { JobsService } from './jobs.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '33333333-3333-4333-8333-333333333333';

function buildService(job: unknown): { service: JobsService; findFirst: jest.Mock } {
  const findFirst = jest.fn().mockResolvedValue(job);
  const prisma = { job: { findFirst } } as unknown as PrismaService;
  return { service: new JobsService(prisma), findFirst };
}

describe('JobsService', () => {
  it('siempre acota la consulta a la organización del contexto', async () => {
    const { service, findFirst } = buildService({
      id: JOB_ID,
      statementId: 'statement-id',
      status: JobStatus.NEEDS_REVIEW,
      attempts: [
        {
          attemptNumber: 2,
          extractorId: 'bcp-coordinate-v1',
          extractorVersion: '0.1.0',
          rowCount: 10,
          movementCount: 6,
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
        },
      ],
    });

    const response = await service.findOne(ORGANIZATION_ID, JOB_ID);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: JOB_ID, organizationId: ORGANIZATION_ID } }),
    );
    expect(response.status).toEqual(JobStatus.NEEDS_REVIEW);
    expect(response.attemptNumber).toEqual(2);
    expect(response.checks).toEqual([{ code: 'BCP_PAGE_TOTALS', status: 'FAILED' }]);
    expect(response.artifacts).toEqual([
      { id: 'artifact-id', kind: 'RESULT_XLSX', byteSize: 2048, name: 'statement.xlsx' },
    ]);
  });

  it('devuelve 404 para un trabajo de otra organización o sin intentos', async () => {
    await expect(
      buildService(null).service.findOne(ORGANIZATION_ID, JOB_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      buildService({
        id: JOB_ID,
        statementId: 'statement-id',
        status: JobStatus.PENDING,
        attempts: [],
      }).service.findOne(ORGANIZATION_ID, JOB_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('JobsService.list', () => {
  function buildList(rows: unknown[]): { service: JobsService; findMany: jest.Mock } {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = { job: { findMany } } as unknown as PrismaService;
    return { service: new JobsService(prisma), findMany };
  }

  function row(index: number): unknown {
    return {
      id: `3333333${String(index)}-3333-4333-8333-333333333333`,
      statementId: 'statement-id',
      status: 'SUCCEEDED',
      createdAt: new Date(`2026-08-2${String(index)}T10:00:00Z`),
      attempts: [
        {
          extractorId: 'bcp-coordinate-v1',
          movementCount: 5,
          _count: { warnings: 2, artifacts: 6 },
        },
      ],
    };
  }

  it('devuelve el historial de la organización más reciente primero', async () => {
    const { service, findMany } = buildList([row(1)]);

    const result = await service.list(ORGANIZATION_ID);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORGANIZATION_ID },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
    expect(result.nextCursor).toBeNull();
    expect(result.items[0]).toMatchObject({
      status: 'SUCCEEDED',
      movementCount: 5,
      warningCount: 2,
      artifactCount: 6,
    });
  });

  it('entrega un cursor solo cuando hay más páginas', async () => {
    const { service } = buildList([row(1), row(2), row(3)]);

    const result = await service.list(ORGANIZATION_ID, { limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
  });

  it('acota el límite pedido al máximo del contrato', async () => {
    const { service, findMany } = buildList([]);

    await service.list(ORGANIZATION_ID, { limit: 1000 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
  });

  it('continúa desde el cursor sin repetir ni saltar filas', async () => {
    const { service, findMany } = buildList([]);
    const cursor = encodeJobCursor({
      createdAt: new Date('2026-08-26T10:00:00Z'),
      id: '33333333-3333-4333-8333-333333333333',
    });

    await service.list(ORGANIZATION_ID, { cursor });

    const where = (findMany.mock.calls[0]?.[0] as { where: { OR: unknown[] } }).where;
    expect(where.OR).toHaveLength(2);
  });

  it('tolera un trabajo sin intentos todavía', async () => {
    const { service } = buildList([
      {
        id: '33333333-3333-4333-8333-333333333333',
        statementId: 'statement-id',
        status: 'PENDING',
        createdAt: new Date('2026-08-26T10:00:00Z'),
        attempts: [],
      },
    ]);

    const result = await service.list(ORGANIZATION_ID);

    expect(result.items[0]).toMatchObject({
      status: 'PENDING',
      extractorId: '',
      movementCount: 0,
      warningCount: 0,
      artifactCount: 0,
    });
  });
});
