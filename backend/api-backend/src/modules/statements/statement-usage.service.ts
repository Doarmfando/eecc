import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JobAttemptStatus,
  PageLotSource,
  PageReservationStatus,
  type Prisma,
} from '@prisma/client';

import { centsToDecimal, decimalToCents } from '../../common/money/cents';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  addDaysToIsoDate,
  businessToday,
  fromIsoDate,
  isExpired,
  startOfBusinessDay,
  toIsoDate,
} from '../../common/time/business-date';
import type { AppConfig } from '../../config/app-config';
import { PLAN } from '../access/access-catalog';
import { CommercialService } from '../commercial/commercial.service';
import type { PageHistoryDto } from './dto/page-history.dto';
import {
  CLAVE_DE_PRUEBA,
  claveDePeriodo,
  compararFefo,
  disponible,
  distribuirConsumo,
  periodoVigente,
  repartirFefo,
  sinConsumir,
  type LoteConSaldo,
} from './page-lots';

/**
 * Margen sobre el timeout del worker antes de dar por muerta una reserva que
 * quedó `PENDING`: el camino normal siempre la resuelve, esto solo cubre que el
 * proceso se caiga a media subida.
 */
export const MARGEN_DE_RESERVA_MS = 5 * 60 * 1000;
const TAMANO_HISTORIAL = 20;

/**
 * Intentos que entregaron un resultado usable: cuentan contra el saldo.
 * Pública porque `StatementsService` la usa para decidir si registra el
 * consumo del intento que acaba de crear (mismo criterio, una sola fuente).
 */
export const ESTADOS_QUE_CONSUMEN: JobAttemptStatus[] = [
  JobAttemptStatus.SUCCEEDED,
  JobAttemptStatus.NEEDS_REVIEW,
];

export interface MonthlyQuotaReservation {
  /** Lo que se envía al worker como `max_pages`. Sin valor: sin tope. */
  maxPages: number | undefined;
  /** Reserva a resolver al terminar la subida. Nula si el plan no tiene tope de cobro. */
  reservationId: string | null;
}

/** Un lote tal como se muestra: con su saldo y, si es una compra, lo que se pagó. */
export interface PageBalanceLot {
  /** Nulo: el lote de la prueba o del periodo todavía no se creó (se crea al primer uso). */
  id: string | null;
  source: PageLotSource;
  planCode: string | null;
  productCode: string | null;
  productName: string | null;
  quantity: number;
  consumed: number;
  held: number;
  available: number;
  startsAt: Date;
  expiresAt: Date | null;
  pricePaidCents: number | null;
  currency: string | null;
  paymentReference: string | null;
  note: string | null;
  registeredByName: string | null;
  createdAt: Date | null;
}

export interface PageBalance {
  /** Sin tope de cobro (el plan interno de administración): no hay saldo que llevar. */
  unlimited: boolean;
  /** La membresía venció: solo cuentan las compras y los ajustes. */
  membershipExpired: boolean;
  /** Suma de lo disponible en los lotes vigentes. Nula si `unlimited`. */
  pagesAvailable: number | null;
  /** Páginas que da la membresía por periodo (o la prueba). Nula si no da. */
  periodQuota: number | null;
  /** Consumido del periodo en curso (o de la prueba). */
  periodUsed: number;
  /** Periodo en curso de la membresía; nulo en la prueba o sin membresía vigente. */
  period: { startsAt: Date; endsAt: Date } | null;
  /** Lotes que se pueden usar hoy, en el orden en que se gastan (FEFO). */
  lots: PageBalanceLot[];
}

export interface RegisterPurchaseCommand {
  organizationId: string;
  userId: string;
  actorUserId: string;
  productCode: string;
  /** Páginas de una recarga; en un paquete no aplica. */
  pages?: number;
  paymentReference?: string;
  note?: string;
  requestId?: string;
}

/** Lo que hace falta leer de la membresía para saber de qué lotes sale el saldo. */
const MIEMBRO_SELECT = {
  planExpiresOn: true,
  trialUsedAt: true,
  monthlyPageQuotaOverride: true,
  periodAnchorAt: true,
  plan: { select: { code: true, monthlyPageQuota: true, trialOneTime: true } },
} satisfies Prisma.OrganizationMembershipSelect;

type Miembro = Prisma.OrganizationMembershipGetPayload<{ select: typeof MIEMBRO_SELECT }>;
type PeriodoPagado = { startsOn: Date; endsOn: Date; pages: number };

const LOTE_INCLUDE = {
  product: { select: { name: true } },
  registeredBy: { select: { displayName: true } },
  allocations: {
    select: {
      reservedPages: true,
      consumedPages: true,
      reservation: { select: { status: true, createdAt: true } },
    },
  },
} satisfies Prisma.PageLotInclude;

type LoteLeido = Prisma.PageLotGetPayload<{ include: typeof LOTE_INCLUDE }>;

/** Qué lotes le corresponden hoy a una persona, según su membresía. */
interface Reglas {
  planCode: string;
  expirada: boolean;
  /** Páginas por periodo (o de la prueba): la recarga manual manda sobre el plan. */
  cuota: number | null;
  prueba: boolean;
  /** Sin tope de cobro: solo el técnico por PDF. */
  ilimitado: boolean;
  /** La prueba todavía no se entregó: se crea su lote al primer uso. */
  pruebaPendiente: boolean;
  periodo: { clave: string; startsAt: Date; expiresAt: Date } | null;
}

/**
 * Saldo de páginas en lotes (ADR-0019).
 *
 * Cada fuente de saldo es un lote con su cantidad y su vencimiento: la prueba
 * gratuita (una vez, no vence), el periodo mensual de la membresía (anclado a su
 * activación o renovación) y cada compra que registra un administrador. Una
 * subida reserva su techo repartido entre lotes, primero el que vence antes
 * (FEFO), y al terminar fija cuánto consumió de cada uno.
 *
 * El consumo de cada lote sale de sus asignaciones, no de un contador: lo
 * confirmado ya no se puede devolver borrando documentos (el registro de
 * consumo es aparte del historial, ADR-0018), y una reserva olvidada deja de
 * apartar sola pasado un margen.
 */
@Injectable()
export class StatementUsageService {
  private readonly logger = new Logger(StatementUsageService.name);
  private readonly vidaDeReservaMs: number;
  private readonly zonaHoraria: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig, true>,
    private readonly commercial: CommercialService,
  ) {
    this.vidaDeReservaMs = config.get('WORKER_TIMEOUT_MS', { infer: true }) + MARGEN_DE_RESERVA_MS;
    this.zonaHoraria = config.get('BUSINESS_TIMEZONE', { infer: true });
  }

  /**
   * Saldo de una persona: sus lotes vigentes con lo disponible en cada uno. No
   * crea nada: un lote de prueba o de periodo que todavía no existe aparece con
   * `id` nulo y su cantidad completa (menos lo que se consumió antes de los lotes).
   */
  async balance(organizationId: string, userId: string): Promise<PageBalance> {
    const ahora = new Date();
    const miembro = await this.leerMiembro(this.prisma, organizationId, userId);
    if (!miembro) {
      return saldoVacio();
    }
    const reglas = await this.reglas(this.prisma, organizationId, userId, miembro, ahora);
    if (reglas.ilimitado) {
      return { ...saldoVacio(), unlimited: true, pagesAvailable: null };
    }
    const lotes = await this.lotesUsables(this.prisma, organizationId, userId, reglas, ahora);
    const vistos = lotes.map((lote) => aLoteVisible(lote, this.conSaldo(lote, ahora)));

    if (reglas.pruebaPendiente && reglas.cuota !== null) {
      vistos.push(loteVirtual(PageLotSource.TRIAL, reglas.planCode, reglas.cuota, 0, ahora, null));
    }
    if (
      reglas.periodo &&
      reglas.cuota !== null &&
      !lotes.some((lote) => lote.periodKey === reglas.periodo?.clave)
    ) {
      const arrastre = await this.arrastre(
        this.prisma,
        organizationId,
        userId,
        reglas.periodo.startsAt,
      );
      vistos.push(
        loteVirtual(
          PageLotSource.MEMBERSHIP_PERIOD,
          reglas.planCode,
          reglas.cuota,
          Math.min(arrastre, reglas.cuota),
          reglas.periodo.startsAt,
          reglas.periodo.expiresAt,
        ),
      );
    }
    vistos.sort(compararFefo);

    const propio = vistos.find(
      (lote) =>
        lote.source === PageLotSource.MEMBERSHIP_PERIOD || lote.source === PageLotSource.TRIAL,
    );
    return {
      unlimited: false,
      membershipExpired: reglas.expirada,
      pagesAvailable: vistos.reduce((total, lote) => total + lote.available, 0),
      periodQuota: reglas.expirada ? null : reglas.cuota,
      periodUsed: propio?.consumed ?? 0,
      period: reglas.periodo
        ? { startsAt: reglas.periodo.startsAt, endsAt: reglas.periodo.expiresAt }
        : null,
      lots: vistos,
    };
  }

  /**
   * Todos los lotes de una persona, también los vencidos o agotados, del más
   * reciente al más antiguo: lo que un administrador necesita para responder
   * «¿cuándo compré y cuánto me queda?».
   */
  async history(organizationId: string, userId: string, limite = 50): Promise<PageBalanceLot[]> {
    const ahora = new Date();
    const lotes = await this.prisma.pageLot.findMany({
      where: { organizationId, userId },
      include: LOTE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limite,
    });
    return lotes.map((lote) => aLoteVisible(lote, this.conSaldo(lote, ahora)));
  }

  async purchaseHistory(
    organizationId: string,
    userId: string,
    cursor?: string,
  ): Promise<PageHistoryDto> {
    const where = { organizationId, userId, source: PageLotSource.PURCHASE };
    if (
      cursor &&
      !(await this.prisma.pageLot.findFirst({
        where: { ...where, id: cursor },
        select: { id: true },
      }))
    ) {
      return { items: [], nextCursor: null };
    }
    const filas = await this.prisma.pageLot.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: TAMANO_HISTORIAL + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        quantity: true,
        createdAt: true,
        expiresAt: true,
        pricePaid: true,
        currency: true,
        product: { select: { name: true } },
      },
    });
    const items = filas.slice(0, TAMANO_HISTORIAL).map((lote) => ({
      kind: 'purchase' as const,
      id: lote.id,
      pages: lote.quantity,
      occurredAt: lote.createdAt.toISOString(),
      productName: lote.product?.name ?? 'Compra de páginas',
      priceCents: lote.pricePaid === null ? null : decimalToCents(lote.pricePaid),
      currency: lote.currency,
      expiresOn: lote.expiresAt
        ? businessToday(this.zonaHoraria, new Date(lote.expiresAt.getTime() - 1))
        : null,
    }));
    return {
      items,
      nextCursor: filas.length > TAMANO_HISTORIAL ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async consumptionHistory(
    organizationId: string,
    userId: string,
    cursor?: string,
  ): Promise<PageHistoryDto> {
    const where = { organizationId, userId };
    if (
      cursor &&
      !(await this.prisma.pageConsumptionEntry.findFirst({
        where: { ...where, id: cursor },
        select: { id: true },
      }))
    ) {
      return { items: [], nextCursor: null };
    }
    const filas = await this.prisma.pageConsumptionEntry.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: TAMANO_HISTORIAL + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, pageCount: true, occurredAt: true },
    });
    const items = filas.slice(0, TAMANO_HISTORIAL).map((consumo) => ({
      kind: 'consumption' as const,
      id: consumo.id,
      pages: consumo.pageCount,
      occurredAt: consumo.occurredAt.toISOString(),
    }));
    return {
      items,
      nextCursor: filas.length > TAMANO_HISTORIAL ? (items.at(-1)?.id ?? null) : null,
    };
  }

  /**
   * ¿Le quedan páginas compradas? Con la membresía vencida no se convierte
   * (ADR-0017), salvo con lo que compró aparte: esas páginas son suyas hasta
   * que venzan (ADR-0019).
   */
  async hasPurchasedBalance(organizationId: string, userId: string): Promise<boolean> {
    const saldo = await this.balance(organizationId, userId);
    return saldo.lots.some(
      (lote) =>
        (lote.source === PageLotSource.PURCHASE || lote.source === PageLotSource.ADJUSTMENT) &&
        lote.available > 0,
    );
  }

  /**
   * Aparta las páginas que puede traer el PDF que se está subiendo ahora, antes
   * de llamar al worker (ADR-0018, anexo de concurrencia), repartidas entre los
   * lotes vigentes en orden FEFO (ADR-0019).
   *
   * Bajo un lock de aviso por persona —que serializa sus subidas simultáneas sin
   * depender de que ya existan filas que bloquear— crea, si hace falta, el lote
   * de la prueba o del periodo en curso; suma lo disponible y aparta como techo
   * para este PDF el mínimo entre eso y el tope técnico. Ese techo es el
   * `max_pages` que recibe el worker, así que el documento nunca puede pasar de
   * lo apartado.
   *
   * Sin nada disponible: `UPLOAD_IN_PROGRESS` si es porque otra subida en curso
   * lo tiene apartado; si no, `MEMBERSHIP_EXPIRED`, `TRIAL_ALREADY_USED` o
   * `MONTHLY_PAGE_QUOTA_EXCEEDED`, según la membresía.
   */
  async reserveMonthlyQuota(
    organizationId: string,
    uploadedById: string,
    maxPagesPerDocument: number | null,
  ): Promise<MonthlyQuotaReservation> {
    return this.prisma.$transaction(async (tx) => {
      const clave = `${organizationId}:${uploadedById}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`;

      const ahora = new Date();
      const miembro = await this.leerMiembro(tx, organizationId, uploadedById);
      if (!miembro) {
        throw new ForbiddenException({ code: 'MEMBERSHIP_NOT_FOUND' });
      }
      const reglas = await this.reglas(tx, organizationId, uploadedById, miembro, ahora);
      if (reglas.ilimitado) {
        return { maxPages: maxPagesPerDocument ?? undefined, reservationId: null };
      }
      await this.crearLotesPropios(tx, organizationId, uploadedById, reglas, ahora);

      const lotes = (await this.lotesUsables(tx, organizationId, uploadedById, reglas, ahora)).map(
        (lote) => ({ ...this.conSaldo(lote, ahora), id: lote.id }),
      );
      const libre = lotes.reduce((total, lote) => total + disponible(lote), 0);
      if (libre <= 0) {
        if (lotes.some((lote) => sinConsumir(lote) > 0)) {
          throw new ConflictException({ code: 'UPLOAD_IN_PROGRESS' });
        }
        throw this.sinSaldo(reglas, lotes);
      }

      const techo = maxPagesPerDocument === null ? libre : Math.min(maxPagesPerDocument, libre);
      const reparto = repartirFefo(lotes, techo);
      const reserva = await tx.pageReservation.create({
        data: {
          organizationId,
          userId: uploadedById,
          pages: techo,
          allocations: {
            create: reparto.map(({ lote, pages }) => ({ lotId: lote.id, reservedPages: pages })),
          },
        },
        select: { id: true },
      });
      return { maxPages: techo, reservationId: reserva.id };
    });
  }

  /**
   * Resuelve una reserva dentro de la transacción que registra la subida.
   * `paginas` nulo: no consumió (falló o no entregó nada usable) y todo vuelve a
   * estar libre. Con número: se confirma y lo consumido se reparte entre lo
   * apartado en cada lote, primero el que vence antes.
   */
  async settleReservation(
    tx: Prisma.TransactionClient,
    reservationId: string,
    paginas: number | null,
  ): Promise<void> {
    const ahora = new Date();
    if (paginas === null) {
      await tx.pageReservation.update({
        where: { id: reservationId },
        data: { status: PageReservationStatus.RELEASED, settledAt: ahora },
      });
      return;
    }
    await tx.pageReservation.update({
      where: { id: reservationId },
      data: { status: PageReservationStatus.COMMITTED, settledAt: ahora },
    });
    const asignaciones = await tx.pageLotAllocation.findMany({
      where: { reservationId },
      select: {
        id: true,
        reservedPages: true,
        lot: { select: { id: true, expiresAt: true, startsAt: true, createdAt: true } },
      },
    });
    const enOrden = [...asignaciones].sort((a, b) => compararFefo(a.lot, b.lot));
    for (const { asignacion, consumed } of distribuirConsumo(enOrden, paginas)) {
      await tx.pageLotAllocation.update({
        where: { id: asignacion.id },
        data: { consumedPages: consumed },
      });
    }
  }

  /**
   * Devuelve a libres las páginas de una subida que no llegó a registrarse.
   * Solo toca una reserva aún `PENDING`: si ya se resolvió dentro de la
   * transacción de la subida, no hace nada. Nunca lanza: se llama desde el
   * manejo de un error, y no debe tapar la causa real.
   */
  async releaseReservation(reservationId: string): Promise<void> {
    try {
      await this.prisma.pageReservation.updateMany({
        where: { id: reservationId, status: PageReservationStatus.PENDING },
        data: { status: PageReservationStatus.RELEASED, settledAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo liberar una reserva de páginas: ${error instanceof Error ? error.name : 'error desconocido'}`,
      );
    }
  }

  /**
   * Registra una compra de Recargas o Profesional que un administrador ya cobró
   * por Yape (ADR-0019): un lote nuevo con las páginas, el precio y la vigencia
   * del catálogo en ese momento, que vale hasta el fin del día en que se cumplen
   * los días de vigencia. Cambiar el catálogo después no lo toca.
   *
   * Quien llama ya comprobó que el administrador puede gestionar a esa persona.
   */
  async registerPurchase(command: RegisterPurchaseCommand): Promise<PageBalanceLot> {
    const cotizacion = await this.commercial.quote(command.productCode, command.pages);
    const ahora = new Date();
    const hoy = businessToday(this.zonaHoraria, ahora);
    const vence = startOfBusinessDay(
      addDaysToIsoDate(hoy, cotizacion.validityDays + 1),
      this.zonaHoraria,
    );

    const lote = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.pageLot.create({
        data: {
          organizationId: command.organizationId,
          userId: command.userId,
          source: PageLotSource.PURCHASE,
          productCode: cotizacion.productCode,
          quantity: cotizacion.pages,
          startsAt: ahora,
          expiresAt: vence,
          pricePaid: centsToDecimal(cotizacion.priceCents),
          currency: cotizacion.currency,
          paymentReference: command.paymentReference ?? null,
          note: command.note ?? null,
          registeredById: command.actorUserId,
        },
        include: LOTE_INCLUDE,
      });
      await tx.auditEvent.create({
        data: {
          organizationId: command.organizationId,
          actorUserId: command.actorUserId,
          action: 'page_lot.purchase_registered',
          entityType: 'user',
          entityId: command.userId,
          ...(command.requestId !== undefined ? { requestId: command.requestId } : {}),
          // Qué se vendió y por cuánto: es dato del negocio, no de la persona.
          metadata: {
            lotId: creado.id,
            productCode: cotizacion.productCode,
            pages: cotizacion.pages,
            priceCents: cotizacion.priceCents,
            currency: cotizacion.currency,
            expiresAt: vence.toISOString(),
          },
        },
      });
      return creado;
    });
    return aLoteVisible(lote, this.conSaldo(lote, ahora));
  }

  private async reglas(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    miembro: Miembro,
    ahora: Date,
  ): Promise<Reglas> {
    const hoy = businessToday(this.zonaHoraria, ahora);
    const vigencia = miembro.planExpiresOn ? toIsoDate(miembro.planExpiresOn) : null;
    const expirada = isExpired(vigencia, hoy);
    // La recarga manual de un administrador manda sobre el tope del plan
    // mientras exista (ADR-0018); se retira al migrar a lotes (ADR-0019).
    const pagado =
      !expirada && miembro.plan.code === PLAN.PERSONAL
        ? await this.periodoPagado(tx, organizationId, userId, hoy)
        : null;
    const cuota =
      pagado?.pages ?? miembro.monthlyPageQuotaOverride ?? miembro.plan.monthlyPageQuota;
    const prueba = miembro.plan.trialOneTime;

    let periodo: Reglas['periodo'] = null;
    if (!expirada && !prueba && cuota !== null) {
      const ancla = businessToday(this.zonaHoraria, miembro.periodAnchorAt);
      const { inicio, fin } = pagado
        ? { inicio: toIsoDate(pagado.startsOn), fin: toIsoDate(pagado.endsOn) }
        : periodoVigente(ancla, hoy);
      periodo = {
        clave: claveDePeriodo(inicio),
        startsAt: startOfBusinessDay(inicio, this.zonaHoraria),
        expiresAt: startOfBusinessDay(fin, this.zonaHoraria),
      };
    }
    return {
      planCode: miembro.plan.code,
      expirada,
      cuota,
      prueba,
      ilimitado: !expirada && !prueba && cuota === null,
      pruebaPendiente: !expirada && prueba && cuota !== null && miembro.trialUsedAt === null,
      periodo,
    };
  }

  private periodoPagado(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    hoy: string,
  ): Promise<PeriodoPagado | null> {
    const fecha = fromIsoDate(hoy);
    return tx.personalPayment.findFirst({
      where: {
        organizationId,
        membership: { userId },
        startsOn: { lte: fecha },
        endsOn: { gt: fecha },
      },
      select: { startsOn: true, endsOn: true, pages: true },
      orderBy: { startsOn: 'desc' },
    });
  }

  private async leerMiembro(
    cliente: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<Miembro | null> {
    return cliente.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: MIEMBRO_SELECT,
    });
  }

  /**
   * Crea, si todavía no existen, el lote de la prueba y el del periodo en curso.
   * Idempotente: la clave única `(organización, persona, period_key)` descarta un
   * duplicado, y el lock de la reserva ya serializa a la misma persona.
   */
  private async crearLotesPropios(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    reglas: Reglas,
    ahora: Date,
  ): Promise<void> {
    if (reglas.pruebaPendiente && reglas.cuota !== null) {
      await tx.pageLot.createMany({
        data: [
          {
            organizationId,
            userId,
            source: PageLotSource.TRIAL,
            planCode: reglas.planCode,
            periodKey: CLAVE_DE_PRUEBA,
            quantity: reglas.cuota,
            startsAt: ahora,
            expiresAt: null,
          },
        ],
        skipDuplicates: true,
      });
      // La prueba se entrega una sola vez por persona, aunque cambie de plan y
      // vuelva: `trial_used_at` ya no vuelve a nulo (ADR-0018).
      await tx.organizationMembership.updateMany({
        where: { organizationId, userId, trialUsedAt: null },
        data: { trialUsedAt: ahora },
      });
    }
    if (reglas.periodo && reglas.cuota !== null) {
      const arrastre = await this.arrastre(tx, organizationId, userId, reglas.periodo.startsAt);
      await tx.pageLot.createMany({
        data: [
          {
            organizationId,
            userId,
            source: PageLotSource.MEMBERSHIP_PERIOD,
            planCode: reglas.planCode,
            periodKey: reglas.periodo.clave,
            quantity: reglas.cuota,
            carriedOverPages: Math.min(arrastre, reglas.cuota),
            startsAt: reglas.periodo.startsAt,
            expiresAt: reglas.periodo.expiresAt,
          },
        ],
        skipDuplicates: true,
      });
    }
  }

  /**
   * Lotes que cuentan hoy: vigentes y, según la membresía, sin la prueba ni el
   * periodo cuando venció, y solo el periodo en curso (un cambio de plan abre
   * uno nuevo y el anterior deja de contar).
   */
  private async lotesUsables(
    cliente: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    reglas: Reglas,
    ahora: Date,
  ): Promise<LoteLeido[]> {
    const lotes = await cliente.pageLot.findMany({
      where: {
        organizationId,
        userId,
        startsAt: { lte: ahora },
        OR: [{ expiresAt: null }, { expiresAt: { gt: ahora } }],
      },
      include: LOTE_INCLUDE,
    });
    return lotes
      .filter((lote) => {
        switch (lote.source) {
          case PageLotSource.MEMBERSHIP_PERIOD:
            return reglas.periodo !== null && lote.periodKey === reglas.periodo.clave;
          case PageLotSource.TRIAL:
            return !reglas.expirada;
          default:
            return true;
        }
      })
      .sort(compararFefo);
  }

  /** Consumido y apartado de un lote, a partir de sus asignaciones. */
  private conSaldo(lote: LoteLeido, ahora: Date): LoteConSaldo {
    const vigenteDesde = ahora.getTime() - this.vidaDeReservaMs;
    let consumido = lote.carriedOverPages;
    let apartado = 0;
    for (const asignacion of lote.allocations) {
      const { status, createdAt } = asignacion.reservation;
      if (status === PageReservationStatus.COMMITTED) {
        consumido += asignacion.consumedPages ?? 0;
      } else if (status === PageReservationStatus.PENDING && createdAt.getTime() >= vigenteDesde) {
        apartado += asignacion.reservedPages;
      }
    }
    return {
      id: lote.id,
      source: lote.source,
      quantity: lote.quantity,
      consumed: consumido,
      held: apartado,
      startsAt: lote.startsAt,
      expiresAt: lote.expiresAt,
      createdAt: lote.createdAt,
    };
  }

  /**
   * Lo consumido desde `desde` que no salió de ningún lote: lo registrado antes
   * de que existieran. Solo cuenta en el primer periodo de cada persona tras la
   * migración; se lee del registro de consumo, nunca se inventa.
   */
  private async arrastre(
    cliente: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    desde: Date,
  ): Promise<number> {
    const resultado = await cliente.pageConsumptionEntry.aggregate({
      _sum: { pageCount: true },
      where: { organizationId, userId, reservationId: null, occurredAt: { gte: desde } },
    });
    return resultado._sum.pageCount ?? 0;
  }

  /** El rechazo que mejor explica por qué no le queda nada. */
  private sinSaldo(reglas: Reglas, lotes: LoteConSaldo[]): Error {
    if (reglas.expirada) {
      return new ForbiddenException({ code: 'MEMBERSHIP_EXPIRED' });
    }
    if (reglas.prueba) {
      return new ForbiddenException({ code: 'TRIAL_ALREADY_USED' });
    }
    const periodo = lotes.find((lote) => lote.source === PageLotSource.MEMBERSHIP_PERIOD);
    return new UnprocessableEntityException({
      code: 'MONTHLY_PAGE_QUOTA_EXCEEDED',
      ...(periodo ? { meta: { used: periodo.consumed, quota: periodo.quantity } } : {}),
    });
  }
}

function saldoVacio(): PageBalance {
  return {
    unlimited: false,
    membershipExpired: false,
    pagesAvailable: 0,
    periodQuota: null,
    periodUsed: 0,
    period: null,
    lots: [],
  };
}

function aLoteVisible(lote: LoteLeido, saldo: LoteConSaldo): PageBalanceLot {
  return {
    id: lote.id,
    source: lote.source,
    planCode: lote.planCode,
    productCode: lote.productCode,
    productName: lote.product?.name ?? null,
    quantity: lote.quantity,
    consumed: saldo.consumed,
    held: saldo.held,
    available: disponible(saldo),
    startsAt: lote.startsAt,
    expiresAt: lote.expiresAt,
    pricePaidCents: lote.pricePaid === null ? null : decimalToCents(lote.pricePaid),
    currency: lote.currency,
    paymentReference: lote.paymentReference,
    note: lote.note,
    registeredByName: lote.registeredBy?.displayName ?? null,
    createdAt: lote.createdAt,
  };
}

function loteVirtual(
  source: PageLotSource,
  planCode: string,
  quantity: number,
  consumed: number,
  startsAt: Date,
  expiresAt: Date | null,
): PageBalanceLot {
  return {
    id: null,
    source,
    planCode,
    productCode: null,
    productName: null,
    quantity,
    consumed,
    held: 0,
    available: Math.max(0, quantity - consumed),
    startsAt,
    expiresAt,
    pricePaidCents: null,
    currency: null,
    paymentReference: null,
    note: null,
    registeredByName: null,
    createdAt: null,
  };
}
