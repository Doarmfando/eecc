import { ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { JobAttemptStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';

const TREINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

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
  constructor(private readonly prisma: PrismaService) {}

  /** Páginas que esa persona ya proceso en los últimos 30 días. */
  async pagesUsedInCurrentPeriod(organizationId: string, uploadedById: string): Promise<number> {
    const desde = new Date(Date.now() - TREINTA_DIAS_MS);
    const resultado = await this.prisma.pageConsumptionEntry.aggregate({
      _sum: { pageCount: true },
      where: {
        organizationId,
        userId: uploadedById,
        occurredAt: { gte: desde },
      },
    });
    return resultado._sum.pageCount ?? 0;
  }

  /**
   * Cuántas páginas puede traer el PDF que se está subiendo ahora.
   *
   * Si el plan no tiene `monthlyPageQuota` (se cotiza, hoy solo Atlas), el único
   * tope es el técnico. Si lo tiene y ya se agotó, rechaza antes de llamar al
   * worker — no hace falta gastar cómputo en un documento que no se va a
   * aceptar. Si queda margen, el número que vuelve es el que se envía al worker
   * como `max_pages`: reutiliza el mismo mecanismo que ya rechazaba por PDF
   * (`PDF_PAGE_LIMIT_EXCEEDED`), solo que ahora el tope es lo que queda del mes.
   */
  async assertWithinMonthlyQuota(
    organizationId: string,
    uploadedById: string,
    plan: MonthlyQuotaPlan,
  ): Promise<number | undefined> {
    if (plan.monthlyPageQuota === null) {
      return plan.maxPagesPerDocument ?? undefined;
    }
    const usado = await this.pagesUsedInCurrentPeriod(organizationId, uploadedById);
    const restante = plan.monthlyPageQuota - usado;
    if (restante <= 0) {
      throw new UnprocessableEntityException({
        code: 'MONTHLY_PAGE_QUOTA_EXCEEDED',
        meta: { used: usado, quota: plan.monthlyPageQuota },
      });
    }
    return plan.maxPagesPerDocument === null
      ? restante
      : Math.min(plan.maxPagesPerDocument, restante);
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
}
