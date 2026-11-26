import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';
import { StatementUsageService } from './statement-usage.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USUARIO_ID = '22222222-2222-4222-8222-222222222222';
const WORKER_TIMEOUT_MS = 120_000;

interface Dobles {
  service: StatementUsageService;
  consumidas: jest.Mock;
  apartadas: jest.Mock;
  reservaCreada: jest.Mock;
  reservasResueltas: jest.Mock;
  lock: jest.Mock;
  updateMany: jest.Mock;
}

function construir(
  opciones: { consumidas?: number | null; apartadas?: number | null; liberarFalla?: boolean } = {},
): Dobles {
  const consumidas = jest
    .fn()
    .mockResolvedValue({ _sum: { pageCount: opciones.consumidas ?? null } });
  const apartadas = jest.fn().mockResolvedValue({ _sum: { pages: opciones.apartadas ?? null } });
  const reservaCreada = jest.fn().mockResolvedValue({ id: 'reserva-id' });
  const reservasResueltas = opciones.liberarFalla
    ? jest.fn().mockRejectedValue(new Error('base caída'))
    : jest.fn().mockResolvedValue({ count: 1 });
  const lock = jest.fn().mockResolvedValue(0);
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });

  const cliente = {
    pageConsumptionEntry: { aggregate: consumidas },
    pageReservation: { aggregate: apartadas, create: reservaCreada, updateMany: reservasResueltas },
    organizationMembership: { updateMany },
    $executeRaw: lock,
  };
  const prisma = {
    ...cliente,
    $transaction: jest.fn(async (handler: (tx: typeof cliente) => Promise<unknown>) =>
      handler(cliente),
    ),
  } as unknown as PrismaService;
  const config = {
    get: (): number => WORKER_TIMEOUT_MS,
  } as unknown as ConfigService<AppConfig, true>;

  return {
    service: new StatementUsageService(prisma, config),
    consumidas,
    apartadas,
    reservaCreada,
    reservasResueltas,
    lock,
    updateMany,
  };
}

const PLAN_BASICA = { maxPagesPerDocument: 1000, monthlyPageQuota: 10 };

describe('StatementUsageService: acumulado', () => {
  it('suma las páginas de los últimos 30 días, filtrando por organización y dueño', async () => {
    const { service, consumidas } = construir({ consumidas: 37 });
    await expect(service.pagesUsedInCurrentPeriod(ORGANIZATION_ID, USUARIO_ID)).resolves.toBe(37);

    const [{ where }] = consumidas.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where.organizationId).toBe(ORGANIZATION_ID);
    expect(where.userId).toBe(USUARIO_ID);
    expect(where.occurredAt).toEqual(
      expect.objectContaining({ gte: expect.any(Date) as unknown as Date }),
    );
    // No se vuelve a contar `job_attempts`: el acumulado sale del registro de
    // consumo aparte, que no se borra con el documento (ADR-0018, anexo).
    expect(where).not.toHaveProperty('job');
    expect(where).not.toHaveProperty('status');
  });

  it('sin intentos previos, cuenta cero en vez de fallar con null', async () => {
    const { service } = construir();
    await expect(service.pagesUsedInCurrentPeriod(ORGANIZATION_ID, USUARIO_ID)).resolves.toBe(0);
  });
});

describe('StatementUsageService: reserva antes de llamar al worker (ADR-0018, anexo)', () => {
  it('sin tope de cobro fijo (Atlas), solo aplica el tope técnico y no aparta nada', async () => {
    const { service, consumidas, reservaCreada, lock } = construir({ consumidas: 999 });

    await expect(
      service.reserveMonthlyQuota(ORGANIZATION_ID, USUARIO_ID, {
        maxPagesPerDocument: 1000,
        monthlyPageQuota: null,
      }),
    ).resolves.toEqual({ maxPages: 1000, reservationId: null });
    expect(consumidas).not.toHaveBeenCalled();
    expect(reservaCreada).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
  });

  it('con margen, aparta lo que queda del mes y eso es lo que recibe el worker', async () => {
    const { service, reservaCreada, lock } = construir({ consumidas: 7 });

    await expect(
      service.reserveMonthlyQuota(ORGANIZATION_ID, USUARIO_ID, PLAN_BASICA),
    ).resolves.toEqual({ maxPages: 3, reservationId: 'reserva-id' });
    expect(reservaCreada).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { organizationId: ORGANIZATION_ID, userId: USUARIO_ID, pages: 3 },
      }),
    );
    // El lock serializa las subidas de esa persona: sin él, dos lecturas
    // simultáneas del acumulado verían el mismo margen.
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it('el tope técnico manda si es menor que lo que queda del mes', async () => {
    const { service } = construir({ consumidas: 0 });

    await expect(
      service.reserveMonthlyQuota(ORGANIZATION_ID, USUARIO_ID, {
        maxPagesPerDocument: 4,
        monthlyPageQuota: 50,
      }),
    ).resolves.toMatchObject({ maxPages: 4 });
  });

  it('descuenta lo que otra subida en curso ya tiene apartado', async () => {
    const { service, reservaCreada } = construir({ consumidas: 2, apartadas: 5 });

    await expect(
      service.reserveMonthlyQuota(ORGANIZATION_ID, USUARIO_ID, PLAN_BASICA),
    ).resolves.toMatchObject({ maxPages: 3 });
    expect(reservaCreada).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pages: 3 }) as unknown }),
    );
  });

  it('una reserva olvidada deja de contar pasado el timeout del worker más un margen', async () => {
    const { service, apartadas } = construir({ consumidas: 0 });
    const antes = Date.now();

    await service.reserveMonthlyQuota(ORGANIZATION_ID, USUARIO_ID, PLAN_BASICA);

    const [{ where }] = apartadas.mock.calls[0] as [
      { where: { status: string; createdAt: { gte: Date } } },
    ];
    expect(where.status).toBe('PENDING');
    const limite = antes - where.createdAt.gte.getTime();
    expect(limite).toBeGreaterThanOrEqual(WORKER_TIMEOUT_MS);
    expect(limite).toBeLessThan(WORKER_TIMEOUT_MS + 10 * 60 * 1000);
  });

  it('agotado el mes, rechaza antes de llamar al worker, con los números del rechazo', async () => {
    const { service, reservaCreada } = construir({ consumidas: 10 });

    await expect(
      service.reserveMonthlyQuota(ORGANIZATION_ID, USUARIO_ID, PLAN_BASICA),
    ).rejects.toMatchObject(
      new UnprocessableEntityException({
        code: 'MONTHLY_PAGE_QUOTA_EXCEEDED',
        meta: { used: 10, quota: 10 },
      }),
    );
    expect(reservaCreada).not.toHaveBeenCalled();
  });

  it('con margen en el mes pero todo apartado por otra subida, pide esperar en vez de decir que se acabó', async () => {
    const { service, reservaCreada } = construir({ consumidas: 4, apartadas: 6 });

    await expect(
      service.reserveMonthlyQuota(ORGANIZATION_ID, USUARIO_ID, PLAN_BASICA),
    ).rejects.toMatchObject(new ConflictException({ code: 'UPLOAD_IN_PROGRESS' }));
    expect(reservaCreada).not.toHaveBeenCalled();
  });
});

describe('StatementUsageService: liberar una reserva', () => {
  it('solo toca una reserva todavía pendiente', async () => {
    const { service, reservasResueltas } = construir();

    await service.releaseReservation('reserva-id');

    expect(reservasResueltas).toHaveBeenCalledWith({
      where: { id: 'reserva-id', status: 'PENDING' },
      data: expect.objectContaining({ status: 'RELEASED' }) as unknown,
    });
  });

  it('nunca lanza: se llama mientras se maneja otro error y no debe taparlo', async () => {
    const { service } = construir({ liberarFalla: true });
    await expect(service.releaseReservation('reserva-id')).resolves.toBeUndefined();
  });
});

describe('StatementUsageService: prueba única', () => {
  it('la prueba única ya usada no deja convertir de nuevo', () => {
    const { service } = construir();
    expect(() => service.assertTrialAvailable(true, false)).toThrow(
      new ForbiddenException({ code: 'TRIAL_ALREADY_USED' }),
    );
    expect(() => service.assertTrialAvailable(true, true)).not.toThrow();
    expect(() => service.assertTrialAvailable(false, false)).not.toThrow();
  });

  it('marcar la prueba usada es idempotente: no vuelve a tocar una ya marcada', async () => {
    const { service, updateMany } = construir();
    await service.markTrialUsed(ORGANIZATION_ID, USUARIO_ID);
    const [{ where }] = updateMany.mock.calls[0] as [{ where: Record<string, unknown> }];
    expect(where).toEqual({
      organizationId: ORGANIZATION_ID,
      userId: USUARIO_ID,
      trialUsedAt: null,
    });
  });
});
