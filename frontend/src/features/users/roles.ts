import type { Member, MemberAction } from '@/lib/session-client';

/**
 * Nombres de los roles del sistema, solo por si la API no los manda (una versión
 * anterior). Los roles nuevos traen su nombre del catálogo.
 */
const ETIQUETA_ROL: Record<string, string> = {
  SUPER_ADMIN: 'Superadministrador',
  ADMIN: 'Administrador',
  MEMBER: 'Usuario',
};

export function nombreDeRol(codigo: string, nombre?: string): string {
  return nombre ?? ETIQUETA_ROL[codigo] ?? codigo;
}

const TODAS: MemberAction[] = [
  'EDIT_PROFILE',
  'CHANGE_PLAN',
  'CHANGE_ROLE',
  'CHANGE_STATUS',
  'RESET_PASSWORD',
  'DELETE',
];

/**
 * Lo que se puede hacer con esa cuenta. Lo decide la API por rangos; con una API
 * anterior que no lo manda, se aplican las reglas de siempre (ADR-0008).
 */
export function accionesSobre(miembro: Member, esYo: boolean): ReadonlySet<MemberAction> {
  if (miembro.actions) {
    return new Set(miembro.actions);
  }
  if (esYo) {
    return new Set(['EDIT_PROFILE']);
  }
  return new Set(
    miembro.role === 'ADMIN' ? TODAS.filter((a) => a !== 'DELETE' && a !== 'CHANGE_ROLE') : TODAS,
  );
}
