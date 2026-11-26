import { PrismaClient } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../src/common/prisma/prisma.service';
import type { AppConfig } from '../src/config/app-config';
import { CommercialService } from '../src/modules/commercial/commercial.service';
import { StatementUsageService } from '../src/modules/statements/statement-usage.service';

/**
 * Saldo de páginas en lotes contra PostgreSQL real (ADR-0019): FEFO, el lock de
 * aviso con subidas simultáneas, las restricciones de la base y el borrado.
 *
 * Se ejecuta solo con una base disponible y `RUN_DB_TESTS=1`:
 *   RUN_DB_TESTS=1 DATABASE_URL=postgresql://... npx jest test/page-lots.e2e-spec.ts
 *
 * Necesita el catálogo de las migraciones (planes y productos). Crea su propia
 * organización con prefijo reconocible y la borra al terminar.
 */
const ENABLED = process.env.RUN_DB_TESTS === '1';
const describeDatabase = ENABLED ? describe : describe.skip;

const PREFIJO = 'prueba-lotes';
const VIGENCIA_LEJANA = new Date('2099-12-31T00:00:00Z');

describeDatabase('Lotes de páginas (base real)', () => {
  let prisma: PrismaClient;
  let usage: StatementUsageService;
  let organizationId: string;
  let adminId: string;

  async function persona(planCode: string, extra: Record<string, unknown> = {}): Promise<string> {
    const user = await prisma.user.create({
      data: {
        emailNormalized: `${PREFIJO}-${planCode.toLowerCase()}-${String(Date.now())}-${String(Math.random()).slice(2)}@eecc.local`,
        displayName: `${PREFIJO} ${planCode}`,
        status: 'ACTIVE',
      },
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId,
        userId: user.id,
        roleCode: 'MEMBER',
        planCode,
        planExpiresOn: VIGENCIA_LEJANA,
        ...extra,
      },
    });
    return user.id;
  }

  async function codigoDe(promesa: Promise<unknown>): Promise<string | undefined> {
    try {
      await promesa;
      return undefined;
    } catch (error) {
      return (error as { response?: { code?: string } }).response?.code;
    }
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const db = prisma as unknown as PrismaService;
    const config = {
      get: (clave: string): unknown =>
        ({ WORKER_TIMEOUT_MS: 120_000, BUSINESS_TIMEZONE: 'America/Lima' })[clave],
    } as unknown as ConfigService<AppConfig, true>;
    usage = new StatementUsageService(db, config, new CommercialService(db));
    const org = await prisma.organization.create({ data: { displayName: PREFIJO } });
    organizationId = org.id;
    adminId = await persona('ATLAS', { roleCode: 'ADMIN', planExpiresOn: null });
  });

  afterAll(async () => {
    if (organizationId) {
      // Borrar la organización arrastra lotes, reservas y asignaciones en una sola
      // sentencia: es justo lo que la clave `NO ACTION` de las asignaciones permite.
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await prisma.user.deleteMany({ where: { emailNormalized: { startsWith: `${PREFIJO}-` } } });
    await prisma.$disconnect();
  });

  it('gasta primero el periodo y después la compra, y confirma solo lo consumido', async () => {
    const userId = await persona('PERSONAL');
    await usage.registerPurchase({
      organizationId,
      userId,
      actorUserId: adminId,
      productCode: 'RECARGA',
      pages: 40,
      paymentReference: 'YAPE-1',
    });

    const reserva = await usage.reserveMonthlyQuota(organizationId, userId, 1000);
    expect(reserva.maxPages).toBe(90);
    await prisma.$transaction((tx) =>
      usage.settleReservation(tx, reserva.reservationId as string, 60),
    );

    const saldo = await usage.balance(organizationId, userId);
    expect(saldo.lots.map((lote) => [lote.source, lote.consumed, lote.available])).toEqual([
      ['MEMBERSHIP_PERIOD', 50, 0],
      ['PURCHASE', 10, 30],
    ]);
    expect(saldo.pagesAvailable).toBe(30);
  });

  it('subidas simultáneas nunca apartan más de lo disponible', async () => {
    const userId = await persona('PERSONAL');

    const resultados = await Promise.allSettled(
      Array.from({ length: 8 }, () => usage.reserveMonthlyQuota(organizationId, userId, 10)),
    );

    const apartado = resultados
      .filter(
        (
          r,
        ): r is PromiseFulfilledResult<{
          maxPages: number | undefined;
          reservationId: string | null;
        }> => r.status === 'fulfilled',
      )
      .reduce((total, r) => total + (r.value.maxPages ?? 0), 0);
    expect(apartado).toBe(50);
    const rechazos = resultados.filter((r) => r.status === 'rejected');
    expect(rechazos.length).toBe(3);
    for (const rechazo of rechazos) {
      expect((rechazo as PromiseRejectedResult).reason).toMatchObject({
        response: { code: 'UPLOAD_IN_PROGRESS' },
      });
    }
    const lotes = await prisma.pageLot.count({ where: { organizationId, userId } });
    expect(lotes).toBe(1);
  });

  it('la prueba gratuita da 3 páginas en total, una sola vez', async () => {
    const userId = await persona('GRATUITO');

    const primera = await usage.reserveMonthlyQuota(organizationId, userId, 1000);
    expect(primera.maxPages).toBe(3);
    await prisma.$transaction((tx) =>
      usage.settleReservation(tx, primera.reservationId as string, 3),
    );

    expect(await codigoDe(usage.reserveMonthlyQuota(organizationId, userId, 1000))).toBe(
      'TRIAL_ALREADY_USED',
    );
    const membresia = await prisma.organizationMembership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId, userId } },
    });
    expect(membresia.trialUsedAt).not.toBeNull();
  });

  it('con la membresía vencida solo convierte con lo comprado', async () => {
    const userId = await persona('PERSONAL', { planExpiresOn: new Date('2020-01-01T00:00:00Z') });
    expect(await codigoDe(usage.reserveMonthlyQuota(organizationId, userId, 1000))).toBe(
      'MEMBERSHIP_EXPIRED',
    );

    await usage.registerPurchase({
      organizationId,
      userId,
      actorUserId: adminId,
      productCode: 'PROFESIONAL_500',
    });
    await expect(usage.hasPurchasedBalance(organizationId, userId)).resolves.toBe(true);
    await expect(usage.reserveMonthlyQuota(organizationId, userId, 1000)).resolves.toMatchObject({
      maxPages: 500,
    });
  });

  it('la base rechaza un lote o una asignación que rompen las reglas', async () => {
    const userId = await persona('PERSONAL');

    await expect(
      prisma.pageLot.create({
        data: {
          organizationId,
          userId,
          source: 'PURCHASE',
          productCode: 'RECARGA',
          quantity: 5,
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    ).rejects.toThrow(/page_lots_source_shape/);

    const reserva = await usage.reserveMonthlyQuota(organizationId, userId, 10);
    await expect(
      prisma.pageLotAllocation.updateMany({
        where: { reservationId: reserva.reservationId as string },
        data: { consumedPages: 11 },
      }),
    ).rejects.toThrow(/page_lot_allocations_consumed_range/);
  });

  it('borrar a la persona conserva sus lotes, sin dueño', async () => {
    const userId = await persona('GRATUITO');
    await usage.reserveMonthlyQuota(organizationId, userId, 1000);

    await prisma.user.delete({ where: { id: userId } });

    const huerfanos = await prisma.pageLot.count({
      where: { organizationId, userId: null, source: 'TRIAL' },
    });
    expect(huerfanos).toBeGreaterThanOrEqual(1);
  });
});
