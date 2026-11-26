import { randomUUID } from 'node:crypto';
import { PrismaClient, type MembershipPlan } from '@prisma/client';

import { MIGRATION_ACTION, migratePersonal } from '../src/cli/personal-migration';

const describeMigration =
  process.env.RUN_PERSONAL_MIGRATION_TESTS === '1' ? describe : describe.skip;
const ahora = new Date('2026-11-26T15:00:00.000Z');
const vencimiento = new Date('2026-12-25T00:00:00.000Z');
const ancla = new Date('2026-10-25T05:00:00.000Z');
const opciones = { now: ahora, zone: 'America/Lima' };

describeMigration('Corte comercial a Personal (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let organizationId: string;

  beforeAll(async () => {
    const schema = new URL(process.env.DATABASE_URL ?? '').searchParams.get('schema');
    if (!schema?.startsWith('test_personal_')) {
      throw new Error('El ensayo necesita un esquema sintético exclusivo test_personal_*.');
    }
    prisma = new PrismaClient();
    const org = await prisma.organization.create({ data: { displayName: 'Ensayo Personal' } });
    organizationId = org.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function miembro(
    planCode: string,
    extra: {
      roleCode?: string;
      planExpiresOn?: Date | null;
      monthlyPageQuotaOverride?: number;
    } = {},
  ): Promise<{ id: string; userId: string }> {
    const user = await prisma.user.create({
      data: {
        emailNormalized: `simulacion-${randomUUID()}@eecc.local`,
        displayName: 'Cuenta sintética',
      },
    });
    return prisma.organizationMembership.create({
      data: {
        organizationId,
        userId: user.id,
        roleCode: 'MEMBER',
        planCode,
        planExpiresOn: vencimiento,
        planChangedAt: ancla,
        periodAnchorAt: ancla,
        ...extra,
      },
      select: { id: true, userId: true },
    });
  }

  it('ensaya el corte, conserva saldo contratado y consumo, y aplica una sola vez', async () => {
    const basica = await miembro('BASICA');
    const especial = await miembro('ESPECIAL');
    const vencida = await miembro('ESPECIAL', {
      planExpiresOn: new Date('2026-11-01T00:00:00.000Z'),
    });
    const ajuste = await miembro('BASICA', { monthlyPageQuotaOverride: 100 });
    const atlas = await miembro('ATLAS');
    const administrador = await miembro('ATLAS', { roleCode: 'ADMIN', planExpiresOn: null });
    const gratuito = await miembro('GRATUITO');
    await prisma.organizationMembership.update({
      where: { id: gratuito.id },
      data: { trialUsedAt: ancla },
    });
    const documento = await prisma.statement.create({
      data: {
        organizationId,
        uploadedById: basica.userId,
        contentFingerprint: 'a'.repeat(64),
        byteSize: 128,
      },
    });

    const lote = await prisma.pageLot.create({
      data: {
        organizationId,
        userId: basica.userId,
        source: 'MEMBERSHIP_PERIOD',
        planCode: 'BASICA',
        periodKey: 'PERIOD:2026-11-25',
        quantity: 15,
        carriedOverPages: 4,
        startsAt: new Date('2026-11-25T05:00:00.000Z'),
        expiresAt: new Date('2026-12-25T05:00:00.000Z'),
      },
    });
    const compra = await prisma.pageLot.create({
      data: {
        organizationId,
        userId: basica.userId,
        source: 'PURCHASE',
        productCode: 'RECARGA',
        quantity: 20,
        startsAt: ancla,
        expiresAt: new Date('2027-02-25T05:00:00.000Z'),
        pricePaid: '3.00',
        currency: 'PEN',
      },
    });
    const consumo = await prisma.pageConsumptionEntry.create({
      data: {
        organizationId,
        userId: especial.userId,
        pageCount: 7,
        occurredAt: new Date('2026-11-10T15:00:00.000Z'),
        countedStatus: 'SUCCEEDED',
      },
    });
    const reserva = await prisma.pageReservation.create({
      data: { organizationId, userId: basica.userId, pages: 5 },
    });
    const migrar = (apply: boolean): ReturnType<typeof migratePersonal> =>
      migratePersonal(prisma, { ...opciones, apply });
    const personal = (): Promise<MembershipPlan> =>
      prisma.membershipPlan.findUniqueOrThrow({ where: { code: 'PERSONAL' } });

    await expect(migrar(false)).resolves.toEqual({
      destinoPersonal: 2,
      destinoAdministracion: 1,
      condicionesEspeciales: 1,
      atlasDeOtrosRoles: 1,
      conReservaPendiente: 1,
    });
    expect((await personal()).isActive).toBe(false);
    await expect(migrar(true)).rejects.toThrow('RESERVAS_PENDIENTES');
    expect((await personal()).isActive).toBe(false);
    expect(await prisma.auditEvent.count({ where: { organizationId } })).toBe(0);
    await prisma.pageReservation.update({
      where: { id: reserva.id },
      data: { status: 'COMMITTED' },
    });
    const asignacion = await prisma.pageLotAllocation.create({
      data: {
        reservationId: reserva.id,
        lotId: lote.id,
        reservedPages: 5,
        consumedPages: 3,
      },
    });

    await expect(migrar(true)).resolves.toMatchObject({
      destinoPersonal: 3,
      destinoAdministracion: 1,
    });
    expect((await personal()).isActive).toBe(true);
    const porId = new Map(
      (await prisma.organizationMembership.findMany({ where: { organizationId } })).map((fila) => [
        fila.id,
        fila,
      ]),
    );
    expect(porId.get(basica.id)).toMatchObject({
      planCode: 'PERSONAL',
      roleCode: 'MEMBER',
      planExpiresOn: vencimiento,
      periodAnchorAt: ancla,
    });
    expect(porId.get(vencida.id)).toMatchObject({
      planCode: 'PERSONAL',
      planExpiresOn: new Date('2026-11-01T00:00:00.000Z'),
    });
    expect(porId.get(ajuste.id)).toMatchObject({
      planCode: 'BASICA',
      monthlyPageQuotaOverride: 100,
    });
    expect(porId.get(atlas.id)).toMatchObject({ planCode: 'ATLAS', roleCode: 'MEMBER' });
    expect(porId.get(administrador.id)).toMatchObject({
      planCode: 'ADMINISTRACION',
      roleCode: 'ADMIN',
    });
    expect(porId.get(gratuito.id)).toMatchObject({ planCode: 'GRATUITO', trialUsedAt: ancla });
    await expect(
      prisma.pageLot.findUniqueOrThrow({ where: { id: lote.id } }),
    ).resolves.toMatchObject({ quantity: 50, carriedOverPages: 4 });
    await expect(
      prisma.pageLotAllocation.findUniqueOrThrow({ where: { id: asignacion.id } }),
    ).resolves.toMatchObject({ consumedPages: 3 });
    await expect(prisma.pageLot.findUniqueOrThrow({ where: { id: compra.id } })).resolves.toEqual(
      compra,
    );
    await expect(
      prisma.statement.findUniqueOrThrow({ where: { id: documento.id } }),
    ).resolves.toEqual(documento);
    await expect(
      prisma.pageConsumptionEntry.findUniqueOrThrow({ where: { id: consumo.id } }),
    ).resolves.toEqual(consumo);
    await expect(
      prisma.pageLot.findFirst({ where: { organizationId, userId: especial.userId } }),
    ).resolves.toMatchObject({
      quantity: 50,
      carriedOverPages: 7,
      periodKey: 'PERIOD:2026-11-25',
    });
    await expect(
      prisma.pageLot.count({ where: { organizationId, userId: vencida.userId } }),
    ).resolves.toBe(0);
    await expect(migrar(true)).resolves.toMatchObject({
      destinoPersonal: 0,
      destinoAdministracion: 0,
    });
    await expect(
      prisma.auditEvent.count({ where: { organizationId, action: MIGRATION_ACTION } }),
    ).resolves.toBe(4);
    await expect(
      prisma.membershipPlan.findUniqueOrThrow({ where: { code: 'GRATUITO' } }),
    ).resolves.toMatchObject({ isDefault: true });
  });
});
