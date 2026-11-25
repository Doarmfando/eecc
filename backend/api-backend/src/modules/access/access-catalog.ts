import type { Prisma } from '@prisma/client';

import { isExpired, toIsoDate } from '../../common/time/business-date';

/**
 * Códigos del catálogo de acceso sembrado por la migración `roles_y_membresias`.
 *
 * Son el contrato entre la base y el código: nombres y descripciones se pueden
 * cambiar en la base sin desplegar, los códigos no. El código pregunta por
 * permisos, funciones y rango, nunca por el nombre de un plan o de un rol; los
 * códigos de rol solo se usan para sembrar cuentas (arranque, semilla, CLI).
 * Ver ADR-0016.
 */
export const SYSTEM_ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;

export const PERMISSION = {
  /** Subir estados de cuenta y descargar sus conversiones. */
  STATEMENTS_CONVERT: 'STATEMENTS_CONVERT',
  /** Gestionar las cuentas de la organización y asignar su membresía. */
  USERS_MANAGE: 'USERS_MANAGE',
  /**
   * Crear o modificar el catálogo de membresías (precio, páginas, vistas).
   * Solo lo tiene SUPER_ADMIN: cambia el negocio para todas las organizaciones,
   * no una cuenta a la vez como `USERS_MANAGE` (ADR-0018).
   */
  PLANS_MANAGE: 'PLANS_MANAGE',
} as const;

export const FEATURE = {
  HISTORY: 'HISTORY',
  FINANCIAL_CENTER: 'FINANCIAL_CENTER',
  FINANCIAL_CALENDAR: 'FINANCIAL_CALENDAR',
} as const;

export const PLAN = {
  BASICA: 'BASICA',
  ATLAS: 'ATLAS',
} as const;

/** Mismo formato que exigen las restricciones `*_code_format` de la base. */
export const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,31}$/;
export const PLAN_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,31}$/;

/** Límites y vistas de la membresía de una persona, tal como los aplica la API. */
export interface PlanSummary {
  code: string;
  name: string;
  /** Documentos que conserva; al superarlo se reemplaza uno. */
  maxRetainedStatements: number;
  /** Tope técnico de seguridad por PDF, igual para todos los planes. Nulo: sin tope. */
  maxPagesPerDocument: number | null;
  /** Páginas acumuladas al mes que decide el cobro. Nulo: sin tope fijo, se cotiza. */
  monthlyPageQuota: number | null;
  /** La prueba se consume una sola vez por persona y no se renueva cada mes. */
  trialOneTime: boolean;
  /** Funciones que habilita además de convertir. */
  features: string[];
}

/** El plan de una persona concreta: sus límites y hasta cuándo vale (ADR-0017). */
export interface MembershipPlanState extends PlanSummary {
  /** Último día de vigencia (`YYYY-MM-DD`). Nulo: no vence. */
  expiresOn: string | null;
  /** Ya pasó su último día: no puede convertir hasta que la renueven. */
  expired: boolean;
  /** Si todavía puede consumir la prueba gratuita (`trialOneTime`); siempre
   * `true` en un plan que no es de prueba única (ADR-0018). */
  trialAvailable: boolean;
}

/** Lo que una membresía de organización concede: rol con sus permisos y plan. */
export interface MembershipAccess {
  role: string;
  roleName: string;
  /** Rango del rol: decide a quién puede gestionar (ver `member-rules.ts`). */
  roleRank: number;
  permissions: string[];
  plan: MembershipPlanState;
}

/** Consulta común para leer rol, permisos y plan de una membresía en un solo viaje. */
export const MEMBERSHIP_ACCESS_INCLUDE = {
  role: {
    select: {
      code: true,
      name: true,
      rank: true,
      permissions: { select: { permissionCode: true }, orderBy: { permissionCode: 'asc' } },
    },
  },
  plan: {
    select: {
      code: true,
      name: true,
      maxRetainedStatements: true,
      maxPagesPerDocument: true,
      monthlyPageQuota: true,
      trialOneTime: true,
      features: { select: { featureCode: true }, orderBy: { featureCode: 'asc' } },
    },
  },
} satisfies Prisma.OrganizationMembershipInclude;

export interface MembershipWithAccess {
  planExpiresOn: Date | null;
  trialUsedAt: Date | null;
  /** Recarga puesta a mano por un administrador, por encima del tope del plan. */
  monthlyPageQuotaOverride: number | null;
  role: { code: string; name: string; rank: number; permissions: { permissionCode: string }[] };
  plan: {
    code: string;
    name: string;
    maxRetainedStatements: number;
    maxPagesPerDocument: number | null;
    monthlyPageQuota: number | null;
    trialOneTime: boolean;
    features: { featureCode: string }[];
  };
}

/** `hoy` es el día del negocio (`businessToday`): decide si la vigencia ya pasó. */
export function toMembershipAccess(
  membership: MembershipWithAccess,
  hoy: string,
): MembershipAccess {
  const expiresOn = membership.planExpiresOn ? toIsoDate(membership.planExpiresOn) : null;
  return {
    role: membership.role.code,
    roleName: membership.role.name,
    roleRank: membership.role.rank,
    permissions: membership.role.permissions.map(({ permissionCode }) => permissionCode),
    plan: {
      ...toPlanSummary(membership.plan),
      // La recarga de un administrador manda sobre el tope del plan; sin ella,
      // el de siempre. Así el resto del código (worker, aviso, interfaz) solo
      // ve un número, sin saber que existe la recarga (ADR-0018 y su anexo).
      monthlyPageQuota: membership.monthlyPageQuotaOverride ?? membership.plan.monthlyPageQuota,
      expiresOn,
      expired: isExpired(expiresOn, hoy),
      trialAvailable: !membership.plan.trialOneTime || membership.trialUsedAt === null,
    },
  };
}

export function toPlanSummary(plan: MembershipWithAccess['plan']): PlanSummary {
  return {
    code: plan.code,
    name: plan.name,
    maxRetainedStatements: plan.maxRetainedStatements,
    maxPagesPerDocument: plan.maxPagesPerDocument,
    monthlyPageQuota: plan.monthlyPageQuota,
    trialOneTime: plan.trialOneTime,
    features: plan.features.map(({ featureCode }) => featureCode),
  };
}
