import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';
import { CommercialReportService } from './report.service';

const now = new Date('2026-11-26T04:55:00Z');

function build(cost = ''): { service: CommercialReportService; query: jest.Mock } {
  const query = jest
    .fn()
    .mockResolvedValueOnce([
      {
        registered: 2n,
        free: 2n,
        personalActive: 0n,
        expired: 0n,
        cancelled: 0n,
        freeCohort: 0n,
        converted: 0n,
      },
    ])
    .mockResolvedValueOnce([
      {
        product: 'RECARGA',
        kind: 'PER_PAGE',
        currency: 'PEN',
        payments: 1n,
        pagesSold: 23n,
        revenue: new Prisma.Decimal('3.45'),
        activeMonthly: new Prisma.Decimal(0),
      },
    ])
    .mockResolvedValueOnce([
      {
        product: 'RECARGA',
        granted: 23n,
        available: new Prisma.Decimal(18),
        held: new Prisma.Decimal(0),
        expired: new Prisma.Decimal(0),
        consumed: new Prisma.Decimal(5),
      },
    ])
    .mockResolvedValueOnce([
      { userId: null, status: 'SUCCEEDED', total: 1n, pages: new Prisma.Decimal(5) },
      { userId: null, status: 'REJECTED', total: 1n, pages: new Prisma.Decimal(0) },
    ]);
  const transaction = { $executeRaw: jest.fn().mockResolvedValue(0), $queryRaw: query };
  const prisma = {
    $transaction: jest.fn(async (run: (db: typeof transaction) => Promise<unknown>) =>
      run(transaction),
    ),
  } as unknown as PrismaService;
  const values: Record<string, unknown> = {
    BUSINESS_TIMEZONE: 'America/Lima',
    WORKER_TIMEOUT_MS: 120_000,
    COMMERCIAL_ESTIMATED_COST_PEN_PER_PAGE: cost,
  };
  const config = { get: (key: string): unknown => values[key] } as unknown as ConfigService<
    AppConfig,
    true
  >;
  return { service: new CommercialReportService(prisma, config), query };
}

describe('CommercialReportService', () => {
  it('por defecto toma 30 días de Lima y mantiene ausentes los costos sin configuración', async () => {
    const { service } = build();
    const report = await service.get('org', {}, now);
    expect(report.window).toMatchObject({ from: '2026-10-27', to: '2026-11-25' });
    expect(report.sales[0]).toMatchObject({ revenueCents: 345, pagesSold: 23 });
    expect(report.users).toEqual([{ userId: null, pages: 5, estimatedCostCents: null }]);
    expect(report.estimatedCostPerPagePen).toBeNull();
  });

  it('solo estima costos desde páginas registradas y redondea en el borde', async () => {
    const { service } = build('0.015');
    const report = await service.get(
      'org',
      { from: '2026-11-25', to: '2026-11-25', organizationId: 'org' },
      now,
    );
    expect(report.users[0]?.estimatedCostCents).toBe(8);
    expect(report.credits[0]?.estimatedCostCents).toBe(8);
  });

  it('rechaza ámbitos ajenos e intervalos no válidos antes de consultar', async () => {
    const { service, query } = build();
    await expect(service.get('org', { organizationId: 'otro' }, now)).rejects.toMatchObject({
      response: { code: 'REPORT_ORGANIZATION_FORBIDDEN' },
    });
    for (const dates of [
      { from: '2026-02-30' },
      { from: '2026-11-20', to: '2026-11-19' },
      { from: '2020-01-01' },
    ]) {
      await expect(service.get('org', dates, now)).rejects.toMatchObject({
        response: { code: 'INVALID_REPORT_DATES' },
      });
    }
    expect(query).not.toHaveBeenCalled();
  });
});
