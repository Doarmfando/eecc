import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';
import type { CommercialService } from '../commercial/commercial.service';
import { StatementUsageService } from './statement-usage.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
/** 26 de noviembre de 2026, 10:00 en Lima. */
const AHORA = new Date('2026-11-26T15:00:00Z');
const VIDA_DE_RESERVA_MS = 120_000 + 5 * 60 * 1000;

interface Miembro {
  planExpiresOn: Date | null;
  trialUsedAt: Date | null;
  monthlyPageQuotaOverride: number | null;
  periodAnchorAt: Date;
  plan: { code: string; monthlyPageQuota: number | null; trialOneTime: boolean };
}

interface Lote {
  id: string;
  organizationId: string;
  userId: string | null;
  source: string;
  planCode: string | null;
  productCode: string | null;
  periodKey: string | null;
  quantity: number;
  carriedOverPages: number;
  startsAt: Date;
  expiresAt: Date | null;
  pricePaid: Prisma.Decimal | null;
  currency: string | null;
  paymentReference: string | null;
  note: string | null;
  registeredById: string | null;
  createdAt: Date;
}

interface Reserva {
  id: string;
  status: string;
  createdAt: Date;
  pages: number;
}

interface Asignacion {
  id: string;
  reservationId: string;
  lotId: string;
  reservedPages: number;
  consumedPages: number | null;
}

interface Estado {
  miembro: Miembro | null;
  lotes: Lote[];
  reservas: Reserva[];
  asignaciones: Asignacion[];
  /** Consumo registrado antes de los lotes (`reservation_id` nulo). */
  legado: { pageCount: number; occurredAt: Date }[];
  auditoria: unknown[];
}

const PERSONAL: Miembro = {
  planExpiresOn: new Date('2099-12-31T00:00:00Z'),
  trialUsedAt: null,
  monthlyPageQuotaOverride: null,
  periodAnchorAt: new Date('2026-10-15T15:00:00Z'),
  plan: { code: 'PERSONAL', monthlyPageQuota: 50, trialOneTime: false },
};

let secuencia = 0;
const nuevoId = (prefijo: string): string => `${prefijo}-${String((secuencia += 1))}`;

function lote(datos: Partial<Lote> & Pick<Lote, 'source' | 'quantity'>): Lote {
  return {
    id: nuevoId('lote'),
    organizationId: ORG,
    userId: USUARIO,
    planCode: null,
    productCode: null,
    periodKey: null,
    carriedOverPages: 0,
    startsAt: new Date('2026-11-01T05:00:00Z'),
    expiresAt: null,
    pricePaid: null,
    currency: null,
    paymentReference: null,
    note: null,
    registeredById: null,
    createdAt: new Date('2026-11-01T05:00:00Z'),
    ...datos,
  };
}

function compra(paginas: number, vence: string, consumido = 0): Lote {
  return lote({
    source: 'PURCHASE',
    productCode: 'RECARGA',
    quantity: paginas,
    carriedOverPages: consumido,
    pricePaid: new Prisma.Decimal('6.00'),
    currency: 'PEN',
    expiresAt: new Date(vence),
  });
}

function construir(inicial: Partial<Estado> = {}): {
  service: StatementUsageService;
  estado: Estado;
  quote: jest.Mock;
  /** El cliente que recibe una transacción: con él se confirma una reserva. */
  tx: Prisma.TransactionClient;
  liberarFalla: () => void;
} {
  const estado: Estado = {
    miembro: PERSONAL,
    lotes: [],
    reservas: [],
    asignaciones: [],
    legado: [],
    auditoria: [],
    ...inicial,
  };

  const conInclusiones = (l: Lote): unknown => ({
    ...l,
    product: l.productCode ? { name: `Producto ${l.productCode}` } : null,
    registeredBy: l.registeredById ? { displayName: 'Admin' } : null,
    allocations: estado.asignaciones
      .filter((a) => a.lotId === l.id)
      .map((a) => {
        const reserva = estado.reservas.find((r) => r.id === a.reservationId);
        return {
          reservedPages: a.reservedPages,
          consumedPages: a.consumedPages,
          reservation: { status: reserva?.status, createdAt: reserva?.createdAt },
        };
      }),
  });

  const cliente = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    organizationMembership: {
      findUnique: jest.fn(() => Promise.resolve(estado.miembro)),
      updateMany: jest.fn(({ data }: { data: { trialUsedAt: Date } }) => {
        if (estado.miembro && estado.miembro.trialUsedAt === null) {
          estado.miembro = { ...estado.miembro, trialUsedAt: data.trialUsedAt };
        }
        return Promise.resolve({ count: 1 });
      }),
    },
    pageLot: {
      createMany: jest.fn(({ data }: { data: Partial<Lote>[] }) => {
        for (const fila of data) {
          if (!estado.lotes.some((l) => l.periodKey !== null && l.periodKey === fila.periodKey)) {
            estado.lotes.push(
              lote({ ...fila, createdAt: AHORA } as Partial<Lote> &
                Pick<Lote, 'source' | 'quantity'>),
            );
          }
        }
        return Promise.resolve({ count: data.length });
      }),
      create: jest.fn(({ data }: { data: Partial<Lote> & Pick<Lote, 'source' | 'quantity'> }) => {
        const creado = lote({ ...data, createdAt: AHORA });
        estado.lotes.push(creado);
        return Promise.resolve(conInclusiones(creado));
      }),
      findMany: jest.fn(
        ({ where, take }: { where: { startsAt?: { lte: Date } }; take?: number }) => {
          const vigentes = where.startsAt
            ? estado.lotes.filter(
                (l) =>
                  l.startsAt <= (where.startsAt as { lte: Date }).lte &&
                  (l.expiresAt === null || l.expiresAt > AHORA),
              )
            : [...estado.lotes].reverse();
          return Promise.resolve(vigentes.slice(0, take).map(conInclusiones));
        },
      ),
    },
    pageConsumptionEntry: {
      aggregate: jest.fn(({ where }: { where: { occurredAt: { gte: Date } } }) => {
        const total = estado.legado
          .filter((e) => e.occurredAt >= where.occurredAt.gte)
          .reduce((suma, e) => suma + e.pageCount, 0);
        return Promise.resolve({ _sum: { pageCount: total === 0 ? null : total } });
      }),
    },
    pageReservation: {
      create: jest.fn(
        ({
          data,
        }: {
          data: {
            pages: number;
            allocations: { create: { lotId: string; reservedPages: number }[] };
          };
        }) => {
          const reserva = {
            id: nuevoId('reserva'),
            status: 'PENDING',
            createdAt: AHORA,
            pages: data.pages,
          };
          estado.reservas.push(reserva);
          for (const a of data.allocations.create) {
            estado.asignaciones.push({
              id: nuevoId('asig'),
              reservationId: reserva.id,
              consumedPages: null,
              ...a,
            });
          }
          return Promise.resolve({ id: reserva.id });
        },
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: { status: string } }) => {
        const reserva = estado.reservas.find((r) => r.id === where.id);
        if (reserva) reserva.status = data.status;
        return Promise.resolve(reserva);
      }),
      updateMany: jest.fn(
        ({ where, data }: { where: { id: string; status: string }; data: { status: string } }) => {
          const reserva = estado.reservas.find(
            (r) => r.id === where.id && r.status === where.status,
          );
          if (reserva) reserva.status = data.status;
          return Promise.resolve({ count: reserva ? 1 : 0 });
        },
      ),
    },
    pageLotAllocation: {
      findMany: jest.fn(({ where }: { where: { reservationId: string } }) =>
        Promise.resolve(
          estado.asignaciones
            .filter((a) => a.reservationId === where.reservationId)
            .map((a) => ({ ...a, lot: estado.lotes.find((l) => l.id === a.lotId) })),
        ),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: { consumedPages: number } }) => {
          const asignacion = estado.asignaciones.find((a) => a.id === where.id);
          if (asignacion) asignacion.consumedPages = data.consumedPages;
          return Promise.resolve(asignacion);
        },
      ),
    },
    auditEvent: {
      create: jest.fn(({ data }: { data: unknown }) => {
        estado.auditoria.push(data);
        return Promise.resolve({});
      }),
    },
  };
  const prisma = {
    ...cliente,
    $transaction: jest.fn(async (handler: (tx: typeof cliente) => Promise<unknown>) =>
      handler(cliente),
    ),
  } as unknown as PrismaService;
  const config = {
    get: (clave: string): unknown =>
      ({ WORKER_TIMEOUT_MS: 120_000, BUSINESS_TIMEZONE: 'America/Lima' })[clave],
  } as unknown as ConfigService<AppConfig, true>;
  const quote = jest.fn().mockResolvedValue({
    productCode: 'RECARGA',
    pages: 40,
    priceCents: 600,
    currency: 'PEN',
    validityDays: 90,
    suggestion: null,
  });
  const commercial = { quote } as unknown as CommercialService;

  return {
    service: new StatementUsageService(prisma, config, commercial),
    estado,
    quote,
    tx: cliente as unknown as Prisma.TransactionClient,
    liberarFalla: (): void => {
      cliente.pageReservation.updateMany.mockRejectedValueOnce(new Error('base caída'));
    },
  };
}

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(AHORA);
});

afterAll(() => {
  jest.useRealTimers();
});

async function rechazo(
  promesa: Promise<unknown>,
): Promise<{ status?: number; code?: string; meta?: unknown }> {
  try {
    await promesa;
  } catch (error) {
    const e = error as { getStatus?: () => number; response?: { code?: string; meta?: unknown } };
    return { status: e.getStatus?.(), code: e.response?.code, meta: e.response?.meta };
  }
  throw new Error('se esperaba un rechazo');
}

describe('StatementUsageService: saldo', () => {
  it('el periodo en curso arranca el día del ancla y descuenta lo consumido antes de los lotes', async () => {
    const { service } = construir({
      legado: [
        // Del periodo anterior (empezó el 15 de octubre): no cuenta.
        { pageCount: 99, occurredAt: new Date('2026-11-10T15:00:00Z') },
        { pageCount: 12, occurredAt: new Date('2026-11-20T15:00:00Z') },
      ],
    });

    const saldo = await service.balance(ORG, USUARIO);

    expect(saldo.period).toEqual({
      startsAt: new Date('2026-11-15T05:00:00Z'),
      endsAt: new Date('2026-12-15T05:00:00Z'),
    });
    expect(saldo.pagesAvailable).toBe(38);
    expect(saldo.periodQuota).toBe(50);
    expect(saldo.periodUsed).toBe(12);
    // Todavía no existe: se crea al primer uso.
    expect(saldo.lots).toEqual([
      expect.objectContaining({
        id: null,
        source: 'MEMBERSHIP_PERIOD',
        quantity: 50,
        available: 38,
      }),
    ]);
  });

  it('suma las compras vigentes en orden FEFO y no cuenta las vencidas', async () => {
    const { service } = construir({
      lotes: [
        compra(500, '2027-03-01T05:00:00Z'),
        compra(40, '2027-02-01T05:00:00Z', 10),
        compra(100, '2026-11-20T05:00:00Z'),
      ],
    });

    const saldo = await service.balance(ORG, USUARIO);

    expect(saldo.lots.map((l) => [l.source, l.quantity, l.available])).toEqual([
      ['MEMBERSHIP_PERIOD', 50, 50],
      ['PURCHASE', 40, 30],
      ['PURCHASE', 500, 500],
    ]);
    expect(saldo.pagesAvailable).toBe(580);
    expect(saldo.lots[1]).toMatchObject({ productName: 'Producto RECARGA', pricePaidCents: 600 });
  });

  it('con la membresía vencida solo cuentan las compras', async () => {
    const { service } = construir({
      miembro: { ...PERSONAL, planExpiresOn: new Date('2026-11-01T00:00:00Z') },
      lotes: [compra(40, '2027-02-01T05:00:00Z')],
    });

    const saldo = await service.balance(ORG, USUARIO);

    expect(saldo.membershipExpired).toBe(true);
    expect(saldo.period).toBeNull();
    expect(saldo.lots.map((l) => l.source)).toEqual(['PURCHASE']);
    await expect(service.hasPurchasedBalance(ORG, USUARIO)).resolves.toBe(true);
  });

  it('la prueba gratuita aparece entera hasta que se usa, y un plan sin tope no lleva saldo', async () => {
    const gratuito = construir({
      miembro: { ...PERSONAL, plan: { code: 'GRATUITO', monthlyPageQuota: 3, trialOneTime: true } },
    });
    await expect(gratuito.service.balance(ORG, USUARIO)).resolves.toMatchObject({
      pagesAvailable: 3,
      period: null,
      lots: [expect.objectContaining({ id: null, source: 'TRIAL', quantity: 3 })],
    });

    const atlas = construir({
      miembro: {
        ...PERSONAL,
        plan: { code: 'ATLAS', monthlyPageQuota: null, trialOneTime: false },
      },
    });
    await expect(atlas.service.balance(ORG, USUARIO)).resolves.toMatchObject({
      unlimited: true,
      pagesAvailable: null,
    });

    const sinMembresia = construir({ miembro: null });
    await expect(sinMembresia.service.balance(ORG, USUARIO)).resolves.toMatchObject({
      pagesAvailable: 0,
      lots: [],
    });
  });

  it('la recarga manual de antes manda sobre el tope del plan mientras exista', async () => {
    const { service } = construir({
      miembro: {
        ...PERSONAL,
        monthlyPageQuotaOverride: 200,
        plan: { code: 'BASICA', monthlyPageQuota: 15, trialOneTime: false },
      },
    });

    await expect(service.balance(ORG, USUARIO)).resolves.toMatchObject({ pagesAvailable: 200 });
  });
});

describe('StatementUsageService: reservar y confirmar', () => {
  it('crea el lote del periodo una sola vez y reparte el techo en orden FEFO', async () => {
    const { service, estado } = construir({
      legado: [{ pageCount: 12, occurredAt: new Date('2026-11-20T15:00:00Z') }],
      lotes: [compra(40, '2027-02-01T05:00:00Z')],
    });

    const reserva = await service.reserveMonthlyQuota(ORG, USUARIO, 1000);

    expect(reserva.maxPages).toBe(78);
    const periodo = estado.lotes.find((l) => l.source === 'MEMBERSHIP_PERIOD');
    expect(periodo).toMatchObject({
      periodKey: 'PERIOD:2026-11-15',
      quantity: 50,
      carriedOverPages: 12,
    });
    expect(estado.asignaciones.map((a) => [a.lotId, a.reservedPages])).toEqual([
      [periodo?.id, 38],
      [estado.lotes[0]?.id, 40],
    ]);

    await service.releaseReservation(reserva.reservationId as string);
    await service.reserveMonthlyQuota(ORG, USUARIO, 5);
    expect(estado.lotes.filter((l) => l.source === 'MEMBERSHIP_PERIOD')).toHaveLength(1);
  });

  it('el tope técnico por PDF limita el techo aunque haya más saldo', async () => {
    const { service } = construir();

    await expect(service.reserveMonthlyQuota(ORG, USUARIO, 20)).resolves.toMatchObject({
      maxPages: 20,
    });
  });

  it('al confirmar, lo consumido llena primero el lote que vence antes y el resto vuelve', async () => {
    const { service, estado, tx } = construir({ lotes: [compra(40, '2027-02-01T05:00:00Z')] });
    const reserva = await service.reserveMonthlyQuota(ORG, USUARIO, 1000);

    await service.settleReservation(tx, reserva.reservationId as string, 60);

    const saldo = await service.balance(ORG, USUARIO);
    expect(saldo.lots.map((l) => [l.source, l.consumed, l.available])).toEqual([
      ['MEMBERSHIP_PERIOD', 50, 0],
      ['PURCHASE', 10, 30],
    ]);
    expect(estado.reservas[0]?.status).toBe('COMMITTED');
  });

  it('una subida que no consumió libera todo lo apartado', async () => {
    const { service, estado, tx } = construir();
    const reserva = await service.reserveMonthlyQuota(ORG, USUARIO, 1000);

    await service.settleReservation(tx, reserva.reservationId as string, null);

    expect(estado.reservas[0]?.status).toBe('RELEASED');
    await expect(service.balance(ORG, USUARIO)).resolves.toMatchObject({ pagesAvailable: 50 });
  });

  it('lo apartado por otra subida en curso no se presta: UPLOAD_IN_PROGRESS', async () => {
    const { service } = construir();
    await service.reserveMonthlyQuota(ORG, USUARIO, 1000);

    await expect(rechazo(service.reserveMonthlyQuota(ORG, USUARIO, 1000))).resolves.toMatchObject({
      status: 409,
      code: 'UPLOAD_IN_PROGRESS',
    });
  });

  it('una reserva olvidada deja de apartar pasado el margen', async () => {
    const { service, estado } = construir();
    await service.reserveMonthlyQuota(ORG, USUARIO, 1000);
    const reserva = estado.reservas[0] as Reserva;
    reserva.createdAt = new Date(AHORA.getTime() - VIDA_DE_RESERVA_MS - 1000);

    await expect(service.reserveMonthlyQuota(ORG, USUARIO, 1000)).resolves.toMatchObject({
      maxPages: 50,
    });
  });

  it('sin saldo dice por qué: periodo agotado, prueba usada o membresía vencida', async () => {
    const agotado = construir({
      legado: [{ pageCount: 50, occurredAt: new Date('2026-11-20T15:00:00Z') }],
    });
    await expect(rechazo(agotado.service.reserveMonthlyQuota(ORG, USUARIO, 1000))).resolves.toEqual(
      {
        status: 422,
        code: 'MONTHLY_PAGE_QUOTA_EXCEEDED',
        meta: { used: 50, quota: 50 },
      },
    );

    const pruebaUsada = construir({
      miembro: {
        ...PERSONAL,
        trialUsedAt: new Date('2026-10-01T00:00:00Z'),
        plan: { code: 'GRATUITO', monthlyPageQuota: 3, trialOneTime: true },
      },
    });
    await expect(
      rechazo(pruebaUsada.service.reserveMonthlyQuota(ORG, USUARIO, 1000)),
    ).resolves.toMatchObject({
      status: 403,
      code: 'TRIAL_ALREADY_USED',
    });

    const vencida = construir({
      miembro: { ...PERSONAL, planExpiresOn: new Date('2026-11-01T00:00:00Z') },
    });
    await expect(
      rechazo(vencida.service.reserveMonthlyQuota(ORG, USUARIO, 1000)),
    ).resolves.toMatchObject({
      status: 403,
      code: 'MEMBERSHIP_EXPIRED',
    });
    await expect(vencida.service.hasPurchasedBalance(ORG, USUARIO)).resolves.toBe(false);

    const sinMembresia = construir({ miembro: null });
    await expect(
      rechazo(sinMembresia.service.reserveMonthlyQuota(ORG, USUARIO, 1000)),
    ).resolves.toMatchObject({
      code: 'MEMBERSHIP_NOT_FOUND',
    });
  });

  it('la prueba gratuita se entrega una vez: 3 páginas en total, en uno o varios PDF', async () => {
    const { service, estado, tx } = construir({
      miembro: { ...PERSONAL, plan: { code: 'GRATUITO', monthlyPageQuota: 3, trialOneTime: true } },
    });

    const primera = await service.reserveMonthlyQuota(ORG, USUARIO, 1000);
    expect(primera.maxPages).toBe(3);
    expect(estado.miembro?.trialUsedAt).toEqual(AHORA);
    expect(estado.lotes).toEqual([
      expect.objectContaining({
        source: 'TRIAL',
        periodKey: 'TRIAL',
        quantity: 3,
        expiresAt: null,
      }),
    ]);
    await service.settleReservation(tx, primera.reservationId as string, 2);

    await expect(service.reserveMonthlyQuota(ORG, USUARIO, 1000)).resolves.toMatchObject({
      maxPages: 1,
    });
    expect(estado.lotes).toHaveLength(1);
  });

  it('un plan sin tope de cobro no reserva nada: solo el tope técnico', async () => {
    const { service, estado } = construir({
      miembro: {
        ...PERSONAL,
        plan: { code: 'ATLAS', monthlyPageQuota: null, trialOneTime: false },
      },
    });

    await expect(service.reserveMonthlyQuota(ORG, USUARIO, 1000)).resolves.toEqual({
      maxPages: 1000,
      reservationId: null,
    });
    await expect(service.reserveMonthlyQuota(ORG, USUARIO, null)).resolves.toEqual({
      maxPages: undefined,
      reservationId: null,
    });
    expect(estado.reservas).toHaveLength(0);
  });

  it('un periodo de antes de cambiar de plan ya no cuenta', async () => {
    const { service, estado } = construir({
      miembro: { ...PERSONAL, periodAnchorAt: new Date('2026-11-26T14:00:00Z') },
      lotes: [
        lote({
          source: 'MEMBERSHIP_PERIOD',
          planCode: 'BASICA',
          periodKey: 'PERIOD:2026-11-15',
          quantity: 15,
          expiresAt: new Date('2026-12-15T05:00:00Z'),
        }),
      ],
    });

    const reserva = await service.reserveMonthlyQuota(ORG, USUARIO, 1000);

    expect(reserva.maxPages).toBe(50);
    expect(estado.lotes.map((l) => l.periodKey)).toEqual([
      'PERIOD:2026-11-15',
      'PERIOD:2026-11-26',
    ]);
  });

  it('liberar nunca lanza: se llama desde el manejo de otro error', async () => {
    const { service, liberarFalla } = construir();
    liberarFalla();

    await expect(service.releaseReservation('reserva-x')).resolves.toBeUndefined();
  });
});

describe('StatementUsageService: compras', () => {
  it('registra la compra con el precio del catálogo y vence al terminar el día 90', async () => {
    const { service, estado, quote } = construir();

    const lote = await service.registerPurchase({
      organizationId: ORG,
      userId: USUARIO,
      actorUserId: ADMIN,
      productCode: 'RECARGA',
      pages: 40,
      paymentReference: 'YAPE-123',
      requestId: 'req-1',
    });

    expect(quote).toHaveBeenCalledWith('RECARGA', 40);
    // 26 de noviembre + 90 días = 24 de febrero; vale hasta el fin de ese día en Lima.
    expect(lote).toMatchObject({
      source: 'PURCHASE',
      quantity: 40,
      available: 40,
      pricePaidCents: 600,
      currency: 'PEN',
      paymentReference: 'YAPE-123',
      registeredByName: 'Admin',
      expiresAt: new Date('2027-02-25T05:00:00Z'),
    });
    expect(estado.lotes[0]?.pricePaid?.toFixed(2)).toBe('6.00');
    expect(estado.auditoria).toEqual([
      expect.objectContaining({
        action: 'page_lot.purchase_registered',
        entityId: USUARIO,
        actorUserId: ADMIN,
        requestId: 'req-1',
        metadata: expect.objectContaining({ productCode: 'RECARGA', pages: 40, priceCents: 600 }),
      }),
    ]);
  });

  it('el historial muestra todos los lotes, también los vencidos', async () => {
    const { service } = construir({
      lotes: [compra(100, '2026-11-20T05:00:00Z'), compra(40, '2027-02-01T05:00:00Z')],
    });

    const historial = await service.history(ORG, USUARIO);

    expect(historial.map((l) => l.quantity)).toEqual([40, 100]);
  });
});
