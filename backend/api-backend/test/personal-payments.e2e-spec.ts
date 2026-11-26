import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '../src/common/prisma/prisma.service';
import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  businessToday,
} from '../src/common/time/business-date';
import type { AppConfig } from '../src/config/app-config';
import { CommercialService } from '../src/modules/commercial/commercial.service';
import { PersonalService } from '../src/modules/commercial/personal.service';
import { StatementUsageService } from '../src/modules/statements/statement-usage.service';

const describePayments = process.env.RUN_PERSONAL_PAYMENT_TESTS === '1' ? describe : describe.skip;
const zone = 'America/Lima';
const today = businessToday(zone);

describePayments('Cobros manuales de Personal (PostgreSQL)', () => {
  let db: PrismaClient;
  let personal: PersonalService;
  let usage: StatementUsageService;
  let organizationId: string;
  let admin: { userId: string; rank: number };

  beforeAll(async () => {
    if (
      !new URL(process.env.DATABASE_URL ?? '').searchParams
        .get('schema')
        ?.startsWith('test_personal_payments_')
    ) {
      throw new Error('Los cobros requieren un esquema sintético exclusivo.');
    }
    db = new PrismaClient();
    const config = {
      get: (key: string): string | number => (key === 'BUSINESS_TIMEZONE' ? zone : 120_000),
    } as unknown as ConfigService<AppConfig, true>;
    const prisma = db as unknown as PrismaService;
    personal = new PersonalService(prisma, config);
    usage = new StatementUsageService(prisma, config, new CommercialService(prisma));
    organizationId = (
      await db.organization.create({ data: { displayName: 'Pruebas de Personal' } })
    ).id;
    admin = { userId: await member('ATLAS', 'ADMIN'), rank: 50 };
    await db.membershipPlan.update({ where: { code: 'PERSONAL' }, data: { isActive: true } });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  async function member(
    planCode: string,
    roleCode = 'MEMBER',
    planExpiresOn = new Date('2099-12-31T00:00:00Z'),
  ): Promise<string> {
    return (
      await db.user.create({
        data: {
          displayName: 'Prueba',
          emailNormalized: `${randomUUID()}@eecc.local`,
          memberships: { create: { organizationId, roleCode, planCode, planExpiresOn } },
        },
      })
    ).id;
  }

  it('activa, reintenta el mismo pago, renueva sin duplicar cuota y conserva la vigencia al cancelar', async () => {
    const userId = await member('GRATUITO');
    const input = { reference: 'YAPE-1', priceCents: 1990, currency: 'PEN' };
    const [first, retry] = await Promise.all([
      personal.register(organizationId, userId, admin, input),
      personal.register(organizationId, userId, admin, { ...input, reference: ' yape-1 ' }),
    ]);
    expect(first).toEqual(retry);
    expect(first).toMatchObject({
      startsOn: today,
      paidThrough: addDaysToIsoDate(addMonthsToIsoDate(today, 1), -1),
      priceCents: 1990,
      pages: 50,
    });
    const reservation = await usage.reserveMonthlyQuota(organizationId, userId, 1000);
    expect(reservation.maxPages).toBe(50);
    if (!reservation.reservationId) throw new Error('Falta la reserva');
    const reservaId = reservation.reservationId;
    await db.$transaction((tx) => usage.settleReservation(tx, reservaId, 10));

    await db.membershipPlan.update({
      where: { code: 'PERSONAL' },
      data: { monthlyPageQuota: 60, priceAmount: '24.90' },
    });
    await expect(
      personal.register(organizationId, userId, admin, { ...input, reference: 'YAPE-2' }),
    ).rejects.toMatchObject({ response: { code: 'PERSONAL_PRICE_CHANGED' } });
    const next = await personal.register(organizationId, userId, admin, {
      ...input,
      reference: 'YAPE-2',
      priceCents: 2490,
    });
    expect(next).toMatchObject({
      startsOn: addMonthsToIsoDate(today, 1),
      pages: 60,
      priceCents: 2490,
    });
    expect(await usage.balance(organizationId, userId)).toMatchObject({
      pagesAvailable: 40,
      periodQuota: 50,
    });

    await personal.cancelRenewal(organizationId, userId);
    await personal.cancelRenewal(organizationId, userId);
    const state = await personal.state(organizationId, userId);
    expect(state.renewalCancelledAt).not.toBeNull();
    expect(state.expiresOn).toBe(next.paidThrough);
    expect(state.payments).toEqual([next, first]);
    expect(
      await db.auditEvent.count({
        where: { organizationId, action: 'personal.renewal_cancelled' },
      }),
    ).toBe(1);

    const other = await member('GRATUITO');
    await expect(personal.register(organizationId, other, admin, input)).rejects.toMatchObject({
      response: { code: 'PAYMENT_REFERENCE_USED' },
    });
    await expect(personal.state(randomUUID(), userId)).rejects.toMatchObject({
      response: { code: 'MEMBER_NOT_FOUND' },
    });
    const legacy = await member('BASICA');
    await expect(
      personal.register(organizationId, legacy, admin, { ...input, reference: 'LEGACY' }),
    ).rejects.toMatchObject({ response: { code: 'PERSONAL_TRANSITION_REQUIRED' } });
  });

  it('conserva el día de renovación tras un febrero corto', async () => {
    await db.membershipPlan.update({ where: { code: 'PERSONAL' }, data: { priceAmount: '19.90' } });
    const userId = await member('PERSONAL', 'MEMBER', new Date('2099-01-30T00:00:00Z'));
    const input = { reference: 'MES-1', priceCents: 1990, currency: 'PEN' };
    const first = await personal.register(organizationId, userId, admin, input);
    const next = await personal.register(organizationId, userId, admin, {
      ...input,
      reference: 'MES-2',
    });
    expect(first).toMatchObject({ startsOn: '2099-01-31', paidThrough: '2099-02-27' });
    expect(next).toMatchObject({ startsOn: '2099-02-28', paidThrough: '2099-03-30' });
  });
});
