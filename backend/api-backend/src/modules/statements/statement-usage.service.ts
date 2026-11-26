import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobAttemptStatus, PageReservationStatus, type Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';

const TREINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Margen sobre el timeout del worker antes de dar por muerta una reserva que
 * quedó `PENDING`: el camino normal siempre la resuelve, esto solo cubre que el
 * proceso se caiga a media subida.
 */
const MARGEN_DE_RESERVA_MS = 5 * 60 * 1000;

/**
 * Intentos que entregaron un resultado usable: cuentan contra el acumulado.
 * Pública porque `StatementsService` la usa para decidir si registra el
 * consumo del intento que acaba de crear (mismo criterio, una sola fuente).
 */
export const ESTADOS_QUE_CONSUMEN: JobAttemptStatus[] = [
  JobAttemptStatus.SUCCEEDED,
  JobAttemptStatus.NEEDS_REVIEW,
];

export interface MonthlyQuotaPlan {
  /** Tope técnico de seguridad por PDF. Nulo: sin tope (no debería pasar en un plan nuevo). */
  maxPagesPerDocument: number | null;
  /** Páginas acumuladas que decide el cobro. Nulo: sin tope fijo, se cotiza. */
  monthlyPageQuota: number | null;
}

export interface MonthlyQuotaReservation {
  /** Lo que se envía al worker como `max_pages`. Sin valor: sin tope. */
  maxPages: number | undefined;
  /** Reserva a resolver al terminar la subida. Nula si el plan no tiene tope de cobro. */
  reservationId: string | null;
}

/**
 * Cobro por páginas acumuladas en una ventana móvil de 30 días (ADR-0018).
 *
 * No hay tarea programada ni columna de periodo: el acumulado se calcula al
 * subir, sumando `page_consumption_entries.page_count` de los últimos 30 días.
 *
 * Ese registro es aparte de `job_attempts` a propósito (ADR-0018, anexo de
 * integridad del cobro): un documento se puede borrar —por su dueño, por el
 * cupo de documentos, o al borrar la cuenta— y eso borra en cascada su
 * `job_attempt`, pero nunca debe borrar lo que ya se cobró por él. Contar
 * `job_attempts` directamente permitía recuperar cupo borrando y resubiendo.
 *
 * Repetir un PDF ya subido reutiliza el trabajo sin crear un intento nuevo
 * (ver `StatementsService`), así que no vuelve a sumar ni a gastar la prueba.
 */
@Injectable()
export class StatementUsageService {
  private readonly logger = new Logger(StatementUsageService.name);
  private readonly vidaDeReservaMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.vidaDeReservaMs = config.get('WORKER_TIMEOUT_MS', { infer: true }) + MARGEN_DE_RESERVA_MS;
  }

  /** Páginas que esa persona ya procesó en los últimos 30 días. */
  async pagesUsedInCurrentPeriod(organizationId: string, uploadedById: string): Promise<number> {
    return this.consumidas(this.prisma, organizationId, uploadedById);
  }

  /**
   * Aparta las páginas que puede traer el PDF que se está subiendo ahora, antes
   * de llamar al worker (ADR-0018, anexo de concurrencia).
   *
   * Sin tope de cobro (se cotiza, hoy solo Atlas) no hay nada que apartar: el
   * único tope es el técnico. Con tope, bajo un lock de aviso por persona —que
   * serializa sus subidas simultáneas sin depender de que ya existan filas que
   * bloquear—, suma lo ya consumido y lo apartado por otras subidas en curso, y
   * aparta lo que queda como techo para este PDF. Ese techo es el `max_pages` que
   * recibe el worker, así que el documento nunca puede pasar de lo apartado.
   *
   * Agotado el mes: `MONTHLY_PAGE_QUOTA_EXCEEDED`, igual que antes. Queda margen
   * en el mes pero otra subida en curso lo tiene apartado: `UPLOAD_IN_PROGRESS`,
   * para no decir "se acabó el mes" cuando basta con esperar.
   */
  async reserveMonthlyQuota(
    organizationId: string,
    uploadedById: string,
    plan: MonthlyQuotaPlan,
  ): Promise<MonthlyQuotaReservation> {
    const cuota = plan.monthlyPageQuota;
    if (cuota === null) {
      return { maxPages: plan.maxPagesPerDocument ?? undefined, reservationId: null };
    }
    return this.prisma.$transaction(async (tx) => {
      const clave = `${organizationId}:${uploadedById}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`;

      const usado = await this.consumidas(tx, organizationId, uploadedById);
      const restante = cuota - usado;
      if (restante <= 0) {
        throw new UnprocessableEntityException({
          code: 'MONTHLY_PAGE_QUOTA_EXCEEDED',
          meta: { used: usado, quota: cuota },
        });
      }
      const apartado = await this.apartadas(tx, organizationId, uploadedById);
      const libre = restante - apartado;
      if (libre <= 0) {
        throw new ConflictException({ code: 'UPLOAD_IN_PROGRESS' });
      }

      const maxPages =
        plan.maxPagesPerDocument === null ? libre : Math.min(plan.maxPagesPerDocument, libre);
      const reserva = await tx.pageReservation.create({
        data: { organizationId, userId: uploadedById, pages: maxPages },
        select: { id: true },
      });
      return { maxPages, reservationId: reserva.id };
    });
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
   * La prueba única ya se gastó: no puede volver a convertir con ese plan.
   * `trialAvailable` ya viene resuelto desde la sesión (igual que
   * `membershipExpired`): siempre `true` en un plan que no es de prueba única.
   */
  assertTrialAvailable(trialOneTime: boolean, trialAvailable: boolean): void {
    if (trialOneTime && !trialAvailable) {
      throw new ForbiddenException({ code: 'TRIAL_ALREADY_USED' });
    }
  }

  /**
   * Marca la prueba como gastada. Idempotente: si ya estaba marcada, no la
   * vuelve a tocar (nunca retrocede a `null`).
   */
  async markTrialUsed(organizationId: string, userId: string): Promise<void> {
    await this.prisma.organizationMembership.updateMany({
      where: { organizationId, userId, trialUsedAt: null },
      data: { trialUsedAt: new Date() },
    });
  }

  private async consumidas(
    cliente: Prisma.TransactionClient,
    organizationId: string,
    uploadedById: string,
  ): Promise<number> {
    const resultado = await cliente.pageConsumptionEntry.aggregate({
      _sum: { pageCount: true },
      where: {
        organizationId,
        userId: uploadedById,
        occurredAt: { gte: new Date(Date.now() - TREINTA_DIAS_MS) },
      },
    });
    return resultado._sum.pageCount ?? 0;
  }

  /** Apartadas por subidas en curso; una reserva olvidada deja de contar con el tiempo. */
  private async apartadas(
    cliente: Prisma.TransactionClient,
    organizationId: string,
    uploadedById: string,
  ): Promise<number> {
    const resultado = await cliente.pageReservation.aggregate({
      _sum: { pages: true },
      where: {
        organizationId,
        userId: uploadedById,
        status: PageReservationStatus.PENDING,
        createdAt: { gte: new Date(Date.now() - this.vidaDeReservaMs) },
      },
    });
    return resultado._sum.pages ?? 0;
  }
}
