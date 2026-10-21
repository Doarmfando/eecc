import type { Prisma } from '@prisma/client';

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
  /** Páginas por PDF. Nulo: sin límite. */
  maxPagesPerDocument: number | null;
  /** Funciones que habilita además de convertir. */
  features: string[];
}

/** Lo que una membresía de organización concede: rol con sus permisos y plan. */
export interface MembershipAccess {
  role: string;
  roleName: string;
  /** Rango del rol: decide a quién puede gestionar (ver `member-rules.ts`). */
  roleRank: number;
  permissions: string[];
  plan: PlanSummary;
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
      features: { select: { featureCode: true }, orderBy: { featureCode: 'asc' } },
    },
  },
} satisfies Prisma.OrganizationMembershipInclude;

export interface MembershipWithAccess {
  role: { code: string; name: string; rank: number; permissions: { permissionCode: string }[] };
  plan: {
    code: string;
    name: string;
    maxRetainedStatements: number;
    maxPagesPerDocument: number | null;
    features: { featureCode: string }[];
  };
}

export function toMembershipAccess(membership: MembershipWithAccess): MembershipAccess {
  return {
    role: membership.role.code,
    roleName: membership.role.name,
    roleRank: membership.role.rank,
    permissions: membership.role.permissions.map(({ permissionCode }) => permissionCode),
    plan: toPlanSummary(membership.plan),
  };
}

export function toPlanSummary(plan: MembershipWithAccess['plan']): PlanSummary {
  return {
    code: plan.code,
    name: plan.name,
    maxRetainedStatements: plan.maxRetainedStatements,
    maxPagesPerDocument: plan.maxPagesPerDocument,
    features: plan.features.map(({ featureCode }) => featureCode),
  };
}
