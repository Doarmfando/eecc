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

/** Páginas por PDF que admite su membresía; `null` sin límite. */
export function paginasPorDocumento(usuario: SessionUser | null): number | null {
  return usuario?.plan?.maxPagesPerDocument ?? null;
}

/** «Básica: 3 documentos guardados · hasta 15 páginas por PDF». */
export function resumenDePlan(plan: {
  maxRetainedStatements: number;
  maxPagesPerDocument: number | null;
}): string {
  const documentos = `${String(plan.maxRetainedStatements)} ${
    plan.maxRetainedStatements === 1 ? 'documento guardado' : 'documentos guardados'
  }`;
  const paginas =
    plan.maxPagesPerDocument === null
      ? 'sin límite de páginas'
      : `hasta ${String(plan.maxPagesPerDocument)} páginas por PDF`;
  return `${documentos} · ${paginas}`;
}
