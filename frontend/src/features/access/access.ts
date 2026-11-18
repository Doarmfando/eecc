import type { SessionUser } from '@/lib/session-client';

/**
 * Funciones que una membresía habilita además de convertir (catálogo `features`).
 *
 * Los nombres y límites de cada plan vienen de la API: aquí solo están los códigos,
 * que son el contrato. Un plan nuevo con estas funciones no toca la interfaz; una
 * función nueva sí, porque es una vista nueva.
 */
export const FEATURE = {
  HISTORY: 'HISTORY',
  FINANCIAL_CENTER: 'FINANCIAL_CENTER',
  FINANCIAL_CALENDAR: 'FINANCIAL_CALENDAR',
} as const;

export type FeatureCode = (typeof FEATURE)[keyof typeof FEATURE];

/** Nombre de cada vista, para explicar qué incluye otra membresía. */
export const NOMBRE_FUNCION: Record<FeatureCode, string> = {
  HISTORY: 'Historial',
  FINANCIAL_CENTER: 'Centro Financiero',
  FINANCIAL_CALENDAR: 'Calendario',
};

export const PERMISSION = {
  USERS_MANAGE: 'USERS_MANAGE',
} as const;

/**
 * Si puede gestionar cuentas. Con una API anterior a los permisos, se deduce del
 * rol como antes: así un despliegue a destiempo no deja a nadie fuera.
 */
export function puedeGestionarCuentas(usuario: SessionUser | null): boolean {
  if (!usuario) {
    return false;
  }
  return usuario.permissions
    ? usuario.permissions.includes(PERMISSION.USERS_MANAGE)
    : usuario.role === 'ADMIN';
}

/**
 * Si su membresía incluye esa vista. Sin plan en la sesión (API anterior) no se
 * bloquea nada: el servidor sigue aplicando cupo y páginas igualmente.
 */
export function tieneFuncion(usuario: SessionUser | null, funcion: FeatureCode): boolean {
  if (!usuario) {
    return false;
  }
  return usuario.plan ? usuario.plan.features.includes(funcion) : true;
}

/** Documentos que conserva antes de reemplazar uno. */
export function cupoDe(usuario: SessionUser | null): number {
  return usuario?.plan?.maxRetainedStatements ?? usuario?.retainedStatementsPerUser ?? 0;
}

/**
 * Páginas acumuladas al mes que admite su membresía, sumando todos los PDF que
 * sube; `null` sin tope fijo (se cotiza). No es el tope por archivo: ese es solo
 * una protección técnica y ya no se muestra (ADR-0018).
 */
export function paginasAlMes(usuario: SessionUser | null): number | null {
  return usuario?.plan?.monthlyPageQuota ?? null;
}

/**
 * «10 páginas acumuladas al mes». El modelo de cobro es solo por páginas
 * (ADR-0018): el cupo de documentos guardados sigue existiendo por
 * almacenamiento, pero deja de anunciarse como límite del plan. Sin
 * `monthlyPageQuota` (sesión de una API anterior a ADR-0018) se asume sin
 * tope fijo, igual que antes de tener este campo.
 */
export function resumenDePlan(plan: {
  monthlyPageQuota?: number | null;
  trialOneTime?: boolean;
}): string {
  if (plan.monthlyPageQuota === null || plan.monthlyPageQuota === undefined) {
    return 'volumen de páginas a cotizar, sin tope fijo';
  }
  return plan.trialOneTime
    ? `${String(plan.monthlyPageQuota)} páginas de prueba, una sola vez`
    : `${String(plan.monthlyPageQuota)} páginas acumuladas al mes`;
}
