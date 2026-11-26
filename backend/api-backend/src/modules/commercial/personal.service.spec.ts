import type { ConfigService } from '@nestjs/config';
import { Prisma, type PersonalPayment } from '@prisma/client';

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';
import { PersonalService } from './personal.service';

const actor = { userId: 'admin', rank: 50 };
const payment = { reference: 'YAPE-1', priceCents: 1990, currency: 'PEN' };
const member = {
  id: 'm1',
  status: 'ACTIVE',
  role: { rank: 10, planExpiryRequired: true },
  planCode: 'PERSONAL',
  planExpiresOn: new Date('2099-01-30T00:00:00Z'),
  personalRenewalCancelledAt: null,
  monthlyPageQuotaOverride: null,
};
const plan = {
  isActive: true,
  monthlyPageQuota: 50,
  priceAmount: new Prisma.Decimal('19.90'),
  currency: 'PEN',
};

interface Doubles {
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
  organizationMembership: { findUnique: jest.Mock; update: jest.Mock };
  membershipPlan: { findUnique: jest.Mock };
  personalPayment: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
  };
  auditEvent: { create: jest.Mock };
}

function build(): { service: PersonalService; tx: Doubles } {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
    organizationMembership: {
      findUnique: jest.fn().mockResolvedValue(member),
      update: jest.fn().mockResolvedValue({}),
    },
    membershipPlan: { findUnique: jest.fn().mockResolvedValue(plan) },
    personalPayment: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(({ data }: { data: Omit<PersonalPayment, 'id'> }) =>
        Promise.resolve({ id: 'pago', ...data }),
      ),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (run: (db: typeof tx) => Promise<unknown>) => run(tx)),
  } as unknown as PrismaService;
  const config = { get: (): string => 'America/Lima' } as unknown as ConfigService<AppConfig, true>;
  return { service: new PersonalService(prisma, config), tx };
}

describe('PersonalService', () => {
  it('asienta el pago y mantiene el inicio del periodo pagado', async () => {
    const { service, tx } = build();
    const registered = await service.register('org', 'cliente', actor, payment);
    expect(registered).toMatchObject({
      startsOn: '2099-01-31',
      paidThrough: '2099-02-27',
      priceCents: 1990,
      pages: 50,
    });
    expect(tx.organizationMembership.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: {
        planCode: 'PERSONAL',
        planExpiresOn: new Date('2099-02-27T00:00:00Z'),
        personalRenewalCancelledAt: null,
      },
    });
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('rechaza un precio cambiado, inactividad, rango insuficiente y un comprobante inválido', async () => {
    const { service, tx } = build();
    await expect(
      service.register('org', 'cliente', actor, { ...payment, priceCents: 1 }),
    ).rejects.toMatchObject({ response: { code: 'PERSONAL_PRICE_CHANGED' } });
    await expect(
      service.register('org', 'cliente', actor, { ...payment, reference: '' }),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_REFERENCE_INVALID' } });
    await expect(service.state('org', 'cliente', { ...actor, rank: 0 })).rejects.toMatchObject({
      response: { code: 'ROLE_ABOVE_YOURS' },
    });
    tx.membershipPlan.findUnique.mockResolvedValueOnce({ ...plan, isActive: false });
    await expect(service.register('org', 'cliente', actor, payment)).rejects.toMatchObject({
      response: { code: 'PERSONAL_UNAVAILABLE' },
    });
    expect(tx.personalPayment.create).not.toHaveBeenCalled();
  });

  it('consulta el estado y cancela una sola vez sin modificar la vigencia', async () => {
    const { service, tx } = build();
    expect(await service.state('org', 'cliente')).toMatchObject({
      canRegister: true,
      expiresOn: '2099-01-30',
      renewalCancelledAt: null,
      payments: [],
    });
    await service.cancelRenewal('org', 'cliente');
    tx.organizationMembership.findUnique.mockResolvedValueOnce({
      ...member,
      personalRenewalCancelledAt: new Date(),
    });
    await service.cancelRenewal('org', 'cliente');
    expect(tx.organizationMembership.update).toHaveBeenCalledTimes(1);
    expect(tx.organizationMembership.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { personalRenewalCancelledAt: expect.any(Date) },
    });
  });
});
