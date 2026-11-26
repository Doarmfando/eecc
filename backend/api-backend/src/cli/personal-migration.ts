import {
  PageLotSource,
  PageReservationStatus,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';

import {
  businessToday,
  isExpired,
  startOfBusinessDay,
  toIsoDate,
} from '../common/time/business-date';
import { PLAN, ROLES_ADMINISTRATIVOS, SYSTEM_ROLE } from '../modules/access/access-catalog';
import { claveDePeriodo, periodoVigente } from '../modules/statements/page-lots';

const PERSONAL = 'PERSONAL';
const GRATIS = 'GRATUITO';
const ATLAS = PLAN.ATLAS;
const INTERNO = PLAN.ADMINISTRACION;
const ANTERIORES = [PLAN.BASICA, 'ESPECIAL'];
export const MIGRATION_ACTION = 'membership.commercial_migration';

const miembroSelect = {
  id: true,
  organizationId: true,
  userId: true,
  roleCode: true,
  planCode: true,
  planExpiresOn: true,
  periodAnchorAt: true,
  monthlyPageQuotaOverride: true,
  plan: {
    select: {
      monthlyPageQuota: true,
      trialOneTime: true,
      features: { select: { featureCode: true } },
    },
  },
} satisfies Prisma.OrganizationMembershipSelect;

type Miembro = Prisma.OrganizationMembershipGetPayload<{ select: typeof miembroSelect }>;

interface Resumen {
  destinoPersonal: number;
  destinoAdministracion: number;
  condicionesEspeciales: number;
  atlasDeOtrosRoles: number;
  conReservaPendiente: number;
}

/** Corte manual. La simulación usa una transacción de solo lectura y solo entrega conteos. */
export async function migratePersonal(
  db: PrismaClient,
  { apply, zone, now = new Date() }: { apply: boolean; zone: string; now?: Date },
): Promise<Resumen> {
  return db.$transaction(
    async (tx) => {
      if (apply) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('eecc:personal-migration', 0))`;
      } else {
        await tx.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
      }

      const personal = await tx.membershipPlan.findUnique({
        where: { code: PERSONAL },
        select: {
          monthlyPageQuota: true,
          trialOneTime: true,
          features: { select: { featureCode: true } },
        },
      });
      const gratis = await tx.membershipPlan.findUnique({
        where: { code: GRATIS },
        select: { trialOneTime: true, isActive: true },
      });
      if (
        !personal?.monthlyPageQuota ||
        personal.trialOneTime ||
        !gratis?.trialOneTime ||
        !gratis.isActive
      ) {
        throw new Error('CATALOGO_COMERCIAL_INVALIDO');
      }

      const atlas = await tx.membershipPlan.findUnique({
        where: { code: ATLAS },
        include: { features: { select: { featureCode: true } } },
      });
      if (!atlas || atlas.trialOneTime || atlas.monthlyPageQuota !== null) {
        throw new Error('PLAN_ATLAS_INTERNO_INVALIDO');
      }
      const interno = await tx.membershipPlan.findUnique({
        where: { code: INTERNO },
        include: { features: { select: { featureCode: true } } },
      });
      if (
        interno &&
        (!interno.isActive ||
          interno.trialOneTime ||
          interno.monthlyPageQuota !== null ||
          interno.maxPagesPerDocument !== atlas.maxPagesPerDocument ||
          atlas.features.some(
            ({ featureCode }) =>
              !interno.features.some((feature) => feature.featureCode === featureCode),
          ))
      ) {
        throw new Error('PLAN_ATLAS_INTERNO_INVALIDO');
      }

      const candidatos = await tx.organizationMembership.findMany({
        where: { planCode: { in: [...ANTERIORES, ATLAS] } },
        select: miembroSelect,
        orderBy: [{ organizationId: 'asc' }, { userId: 'asc' }],
      });
      const resumen: Resumen = {
        destinoPersonal: 0,
        destinoAdministracion: 0,
        condicionesEspeciales: 0,
        atlasDeOtrosRoles: 0,
        conReservaPendiente: 0,
      };

      if (apply && !interno) {
        // Los lotes y el catálogo histórico conservan sus claves foráneas.
        await tx.membershipPlan.create({
          data: {
            code: INTERNO,
            name: 'Administración',
            description: 'Membresía interna de administración.',
            maxPagesPerDocument: atlas.maxPagesPerDocument,
            sortOrder: atlas.sortOrder,
            features: { create: atlas.features },
          },
        });
      }

      const funcionesPersonal = new Set(personal.features.map(({ featureCode }) => featureCode));
      for (const candidato of candidatos) {
        let miembro = candidato;
        if (apply) {
          const clave = `${miembro.organizationId}:${miembro.userId}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`;
          await tx.$queryRaw`SELECT id FROM organization_memberships WHERE id = ${miembro.id}::uuid FOR UPDATE`;
          const actual = await tx.organizationMembership.findUnique({
            where: { id: miembro.id },
            select: miembroSelect,
          });
          if (!actual || ![...ANTERIORES, ATLAS].includes(actual.planCode)) continue;
          miembro = actual;
        }
        await migrateMembership(
          tx,
          miembro,
          {
            cuotaPersonal: personal.monthlyPageQuota,
            funcionesPersonal,
            zone,
            now,
            apply,
          },
          resumen,
        );
      }

      if (apply) {
        if (resumen.conReservaPendiente > 0) throw new Error('RESERVAS_PENDIENTES');
        await tx.membershipPlan.updateMany({
          where: { isDefault: true, code: { not: GRATIS } },
          data: { isDefault: false },
        });
        await tx.membershipPlan.updateMany({
          where: { code: { in: [...ANTERIORES, ATLAS] }, isActive: true },
          data: { isActive: false },
        });
        await tx.membershipPlan.updateMany({
          where: { code: PERSONAL, isActive: false },
          data: { isActive: true },
        });
        await tx.membershipPlan.updateMany({
          where: { code: GRATIS, isDefault: false },
          data: { isDefault: true },
        });
        await tx.role.updateMany({
          where: { code: { in: [...ROLES_ADMINISTRATIVOS] }, defaultPlanCode: ATLAS },
          data: { defaultPlanCode: INTERNO },
        });
        await tx.role.updateMany({
          where: { code: SYSTEM_ROLE.MEMBER, defaultPlanCode: { in: [...ANTERIORES, ATLAS] } },
          data: { defaultPlanCode: GRATIS },
        });
      }

      return resumen;
    },
    { timeout: 60_000 },
  );
}

async function migrateMembership(
  tx: Prisma.TransactionClient,
  miembro: Miembro,
  {
    cuotaPersonal,
    funcionesPersonal,
    zone,
    now,
    apply,
  }: {
    cuotaPersonal: number;
    funcionesPersonal: ReadonlySet<string>;
    zone: string;
    now: Date;
    apply: boolean;
  },
  resumen: Resumen,
): Promise<void> {
  const atlas = miembro.planCode === ATLAS;
  if (atlas && !ROLES_ADMINISTRATIVOS.includes(miembro.roleCode)) {
    resumen.atlasDeOtrosRoles += 1;
    return;
  }
  if (
    miembro.monthlyPageQuotaOverride !== null ||
    (!atlas &&
      (miembro.plan.trialOneTime ||
        miembro.plan.features.some(({ featureCode }) => !funcionesPersonal.has(featureCode)) ||
        miembro.plan.monthlyPageQuota === null ||
        miembro.plan.monthlyPageQuota > cuotaPersonal))
  ) {
    resumen.condicionesEspeciales += 1;
    return;
  }

  const alcance = { organizationId: miembro.organizationId, userId: miembro.userId };
  const hoy = businessToday(zone, now);
  const vencida = isExpired(miembro.planExpiresOn && toIsoDate(miembro.planExpiresOn), hoy);
  const periodo =
    atlas || vencida ? null : periodoVigente(businessToday(zone, miembro.periodAnchorAt), hoy);
  const lote =
    periodo &&
    (await tx.pageLot.findUnique({
      where: {
        organizationId_userId_periodKey: { ...alcance, periodKey: claveDePeriodo(periodo.inicio) },
      },
      select: { id: true, quantity: true, source: true },
    }));
  if (lote && (lote.source !== PageLotSource.MEMBERSHIP_PERIOD || lote.quantity > cuotaPersonal)) {
    resumen.condicionesEspeciales += 1;
    return;
  }
  if (
    !atlas &&
    (await tx.pageReservation.findFirst({
      where: { ...alcance, status: PageReservationStatus.PENDING },
      select: { id: true },
    }))
  ) {
    resumen.conReservaPendiente += 1;
    return;
  }
  const destino = atlas ? INTERNO : PERSONAL;
  if (atlas) resumen.destinoAdministracion += 1;
  else resumen.destinoPersonal += 1;
  if (!apply) return;

  if (lote) {
    await tx.pageLot.update({
      where: { id: lote.id },
      data: { planCode: PERSONAL, quantity: cuotaPersonal },
    });
  } else if (periodo) {
    const startsAt = startOfBusinessDay(periodo.inicio, zone);
    const ventanaAnterior = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const consumo = await tx.pageConsumptionEntry.aggregate({
      where: {
        ...alcance,
        reservationId: null,
        occurredAt: { gte: startsAt < ventanaAnterior ? startsAt : ventanaAnterior, lte: now },
      },
      _sum: { pageCount: true },
    });
    await tx.pageLot.create({
      data: {
        ...alcance,
        source: PageLotSource.MEMBERSHIP_PERIOD,
        planCode: PERSONAL,
        periodKey: claveDePeriodo(periodo.inicio),
        quantity: cuotaPersonal,
        carriedOverPages: Math.min(consumo._sum.pageCount ?? 0, cuotaPersonal),
        startsAt,
        expiresAt: startOfBusinessDay(periodo.fin, zone),
      },
    });
  }
  await tx.organizationMembership.update({
    where: { id: miembro.id },
    data: { planCode: destino, planChangedAt: now },
  });
  await tx.auditEvent.create({
    data: {
      organizationId: miembro.organizationId,
      action: MIGRATION_ACTION,
      entityType: 'membership',
      entityId: miembro.id,
      metadata: { from: miembro.planCode, to: destino },
    },
  });
}
