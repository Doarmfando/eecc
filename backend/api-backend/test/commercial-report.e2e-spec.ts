import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../src/common/prisma/prisma.service';
import type { AppConfig } from '../src/config/app-config';
import { CommercialReportService } from '../src/modules/commercial/report.service';

const describeReports = process.env.RUN_COMMERCIAL_REPORT_TESTS === '1' ? describe : describe.skip;
const now = new Date('2026-11-26T15:00:00Z');
const window = { from: '2026-11-26', to: '2026-11-26' };
const starts = new Date('2026-11-26T00:00:00Z');
const until = new Date('2026-12-26T00:00:00Z');

describeReports('Panel comercial con PostgreSQL', () => {
  let db: PrismaClient;
  let report: CommercialReportService;
  let organizationId: string;
  let otherOrg: string;
  let userId: string;
  let foreignUser: string;

  beforeAll(async () => {
    if (
      !new URL(process.env.DATABASE_URL ?? '').searchParams
        .get('schema')
        ?.startsWith('test_commercial_report_')
    ) {
      throw new Error('El panel se ensaya en un esquema sintético exclusivo.');
    }
    db = new PrismaClient();
    const values: Record<string, string | number> = {
      BUSINESS_TIMEZONE: 'America/Lima',
      WORKER_TIMEOUT_MS: 120_000,
      COMMERCIAL_ESTIMATED_COST_PEN_PER_PAGE: '0.015',
    };
    const config = {
      get: (key: string): string | number => values[key] ?? '',
    } as unknown as ConfigService<AppConfig, true>;
    report = new CommercialReportService(db as unknown as PrismaService, config);
    organizationId = (
      await db.organization.create({ data: { displayName: 'Organización sintética' } })
    ).id;
    otherOrg = (await db.organization.create({ data: { displayName: 'Organización ajena' } })).id;
    const user = await db.user.create({
      data: { displayName: 'Cuenta sintética', emailNormalized: `${randomUUID()}@eecc.local` },
    });
    const other = await db.user.create({
      data: { displayName: 'Cuenta ajena', emailNormalized: `${randomUUID()}@eecc.local` },
    });
    userId = user.id;
    foreignUser = other.id;
    const membership = await db.organizationMembership.create({
      data: {
        organizationId,
        userId,
        roleCode: 'MEMBER',
        planCode: 'PERSONAL',
        planExpiresOn: new Date('2026-12-25T00:00:00Z'),
      },
    });
    await db.organizationMembership.create({
      data: {
        organizationId: otherOrg,
        userId: foreignUser,
        roleCode: 'MEMBER',
        planCode: 'GRATUITO',
      },
    });
    await db.auditEvent.create({
      data: {
        organizationId,
        action: 'member.created',
        entityType: 'user',
        entityId: userId,
        metadata: { planCode: 'GRATUITO' },
        occurredAt: new Date('2026-11-26T06:00:00Z'),
      },
    });
    await db.personalPayment.create({
      data: {
        organizationId,
        membershipId: membership.id,
        reference: 'PERSONAL-1',
        amount: '19.90',
        currency: 'PEN',
        pages: 50,
        startsOn: starts,
        endsOn: until,
        anchorOn: starts,
        recordedAt: now,
      },
    });

    const lot = await db.pageLot.create({
      data: {
        organizationId,
        userId,
        source: 'PURCHASE',
        productCode: 'RECARGA',
        quantity: 23,
        startsAt: now,
        expiresAt: until,
        pricePaid: '3.45',
        currency: 'PEN',
        createdAt: now,
      },
    });
    await db.pageLot.create({
      data: {
        organizationId,
        userId,
        source: 'PURCHASE',
        productCode: 'PROFESIONAL_500',
        quantity: 500,
        startsAt: new Date('2026-08-27T05:00:00Z'),
        expiresAt: new Date('2026-11-26T05:00:00Z'),
        pricePaid: '29.90',
        currency: 'PEN',
        createdAt: new Date('2026-08-27T05:00:00Z'),
      },
    });
    const committed = await db.pageReservation.create({
      data: {
        organizationId,
        userId,
        pages: 5,
        status: 'COMMITTED',
        settledAt: now,
        allocations: { create: { lotId: lot.id, reservedPages: 5, consumedPages: 5 } },
      },
    });
    await db.pageReservation.create({
      data: {
        organizationId,
        userId,
        pages: 6,
        createdAt: now,
        allocations: { create: { lotId: lot.id, reservedPages: 6 } },
      },
    });
    await db.pageReservation.create({
      data: {
        organizationId,
        userId,
        pages: 2,
        createdAt: new Date('2026-11-25T15:00:00Z'),
        allocations: { create: { lotId: lot.id, reservedPages: 2 } },
      },
    });
    await db.pageConsumptionEntry.createMany({
      data: [
        {
          organizationId,
          userId,
          pageCount: 5,
          countedStatus: 'NEEDS_REVIEW',
          occurredAt: now,
          reservationId: committed.id,
        },
        { organizationId, userId, pageCount: 10, countedStatus: 'SUCCEEDED', occurredAt: now },
        {
          organizationId,
          userId,
          pageCount: 200,
          countedStatus: 'SUCCEEDED',
          occurredAt: new Date('2026-11-26T04:59:00Z'),
        },
        {
          organizationId: otherOrg,
          userId: foreignUser,
          pageCount: 999,
          countedStatus: 'SUCCEEDED',
          occurredAt: now,
        },
      ],
    });
    await db.auditEvent.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: 'statement.request_failed',
        entityType: 'statement',
        occurredAt: now,
      },
    });
    const statement = await db.statement.create({
      data: {
        organizationId,
        uploadedById: userId,
        byteSize: 128,
        contentFingerprint: 'a'.repeat(64),
      },
    });
    const job = await db.job.create({
      data: {
        organizationId,
        statementId: statement.id,
        idempotencyKey: 'sintetico-fallo',
        profileVersion: 'test',
      },
    });
    await db.jobAttempt.create({
      data: {
        organizationId,
        jobId: job.id,
        attemptNumber: 1,
        status: 'FAILED',
        pageCount: 2,
        startedAt: now,
        finishedAt: now,
      },
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  it('distingue ventas, saldo, reservas vigentes y consumo dentro del día de Lima', async () => {
    const result = await report.get(organizationId, window, now);
    expect(result.accounts).toMatchObject({
      registered: 1,
      personalActive: 1,
      freeCohort: 1,
      converted: 1,
    });
    expect(result.sales).toEqual([
      {
        product: 'PERSONAL',
        kind: 'MEMBERSHIP',
        currency: 'PEN',
        payments: 1,
        pagesSold: 50,
        revenueCents: 1990,
        activeMonthlyCents: 1990,
      },
      {
        product: 'RECARGA',
        kind: 'PER_PAGE',
        currency: 'PEN',
        payments: 1,
        pagesSold: 23,
        revenueCents: 345,
        activeMonthlyCents: 0,
      },
    ]);
    expect(result.credits).toEqual([
      {
        product: 'PERSONAL',
        granted: 50,
        available: 50,
        held: 0,
        expired: 0,
        consumed: 0,
        estimatedCostCents: 0,
      },
      {
        product: 'PROFESIONAL_500',
        granted: 0,
        available: 0,
        held: 0,
        expired: 500,
        consumed: 0,
        estimatedCostCents: 0,
      },
      {
        product: 'RECARGA',
        granted: 23,
        available: 12,
        held: 6,
        expired: 0,
        consumed: 5,
        estimatedCostCents: 8,
      },
    ]);
    expect(result.operations).toEqual(
      expect.arrayContaining([
        { status: 'SUCCEEDED', count: 1, pages: 10 },
        { status: 'NEEDS_REVIEW', count: 1, pages: 5 },
        { status: 'REJECTED', count: 1, pages: 0 },
        { status: 'FAILED', count: 1, pages: 2 },
      ]),
    );
    expect(result.users).toEqual([{ userId, pages: 17, estimatedCostCents: 26 }]);
  });

  it('restringe organización y filtra producto, usuario y estado con atribución real', async () => {
    await expect(
      report.get(organizationId, { ...window, organizationId: otherOrg }, now),
    ).rejects.toMatchObject({ response: { code: 'REPORT_ORGANIZATION_FORBIDDEN' } });
    await expect(report.get(organizationId, { from: '2026-02-30' }, now)).rejects.toMatchObject({
      response: { code: 'INVALID_REPORT_DATES' },
    });
    const empty = await report.get(organizationId, { ...window, userId: foreignUser }, now);
    expect(empty.accounts.registered).toBe(0);
    expect(empty.users).toEqual([]);
    const result = await report.get(
      organizationId,
      { ...window, userId, product: 'RECARGA', status: 'NEEDS_REVIEW' },
      now,
    );
    expect(result.sales.map((row) => row.product)).toEqual(['RECARGA']);
    expect(result.operations).toEqual([{ status: 'NEEDS_REVIEW', count: 1, pages: 5 }]);
    expect(result.users).toEqual([{ userId, pages: 5, estimatedCostCents: 8 }]);
  });
});
