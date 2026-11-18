import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';

import type { PrismaService } from '../../common/prisma/prisma.service';
import { StatementUsageService } from './statement-usage.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USUARIO_ID = '22222222-2222-4222-8222-222222222222';

function construir(sumaDePaginas: number | null): {
  service: StatementUsageService;
  aggregate: jest.Mock;
  updateMany: jest.Mock;
} {
  const aggregate = jest.fn().mockResolvedValue({ _sum: { pageCount: sumaDePaginas } });
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    jobAttempt: { aggregate },
    organizationMembership: { updateMany },
  } as unknown as PrismaService;
  return { service: new StatementUsageService(prisma), aggregate, updateMany };
}

describe('StatementUsageService', () => {
  it('suma las páginas de los últimos 30 días, filtrando por organización y dueño', async () => {
    const { service, aggregate } = construir(37);
    await expect(service.pagesUsedInCurrentPeriod(ORGANIZATION_ID, USUARIO_ID)).resolves.toBe(37);

    const [{ where }] = aggregate.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where.organizationId).toBe(ORGANIZATION_ID);
    expect(where.job).toEqual({ statement: { uploadedById: USUARIO_ID } });
    expect(where.status).toEqual({ in: ['SUCCEEDED', 'NEEDS_REVIEW'] });
  });

  it('sin intentos previos, cuenta cero en vez de fallar con null', async () => {
    const { service } = construir(null);
    await expect(service.pagesUsedInCurrentPeriod(ORGANIZATION_ID, USUARIO_ID)).resolves.toBe(0);
  });

  it('sin tope de cobro fijo (Atlas), solo aplica el tope técnico, sin consultar el acumulado', async () => {
    const { service, aggregate } = construir(999);
    await expect(
      service.assertWithinMonthlyQuota(ORGANIZATION_ID, USUARIO_ID, {
        maxPagesPerDocument: 1000,
        monthlyPageQuota: null,
      }),
    ).resolves.toBe(1000);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('con margen, envía al worker lo que queda del mes, no el tope técnico completo', async () => {
    const { service } = construir(7);
    await expect(
      service.assertWithinMonthlyQuota(ORGANIZATION_ID, USUARIO_ID, {
        maxPagesPerDocument: 1000,
        monthlyPageQuota: 10,
      }),
    ).resolves.toBe(3);
  });

  it('agotado el mes, rechaza antes de llamar al worker, con los números del rechazo', async () => {
    const { service } = construir(10);
    await expect(
      service.assertWithinMonthlyQuota(ORGANIZATION_ID, USUARIO_ID, {
        maxPagesPerDocument: 1000,
        monthlyPageQuota: 10,
      }),
    ).rejects.toMatchObject(
      new UnprocessableEntityException({
        code: 'MONTHLY_PAGE_QUOTA_EXCEEDED',
        meta: { used: 10, quota: 10 },
      }),
    );
  });

  it('la prueba única ya usada no deja convertir de nuevo', () => {
    const { service } = construir(0);
    expect(() => service.assertTrialAvailable(true, false)).toThrow(
      new ForbiddenException({ code: 'TRIAL_ALREADY_USED' }),
    );
    expect(() => service.assertTrialAvailable(true, true)).not.toThrow();
    expect(() => service.assertTrialAvailable(false, false)).not.toThrow();
  });

  it('marcar la prueba usada es idempotente: no vuelve a tocar una ya marcada', async () => {
    const { service, updateMany } = construir(0);
    await service.markTrialUsed(ORGANIZATION_ID, USUARIO_ID);
    const [{ where }] = updateMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toEqual({
      organizationId: ORGANIZATION_ID,
      userId: USUARIO_ID,
      trialUsedAt: null,
    });
  });
});
