/**
 * Quién puede hacer qué sobre la cuenta de otra persona.
 *
 * Se decide por el **rango** del rol (`roles.rank`), no por su nombre, para que un
 * rol nuevo encaje sin tocar código (ADR-0016):
 *
 * - sobre una cuenta de rango **inferior**, todo;
 * - sobre una del **mismo** rango, solo lo reversible: datos, plan, activar o
 *   desactivar y contraseña. Ni eliminarla ni cambiarle el rol: es la regla de
 *   ADR-0008 («un administrador no elimina ni degrada a otro») generalizada;
 * - sobre una de rango **superior**, nada;
 * - sobre la **propia**, solo datos y plan: el rol, el acceso y la contraseña
 *   propios no se tocan desde la gestión (la contraseña, desde la cuenta).
 *
 * Y nadie asigna un rol de rango superior al suyo.
 */
export const MEMBER_ACTIONS = [
  'EDIT_PROFILE',
  'CHANGE_PLAN',
  'CHANGE_ROLE',
  'CHANGE_STATUS',
  'RESET_PASSWORD',
  'DELETE',
] as const;

export type MemberAction = (typeof MEMBER_ACTIONS)[number];

export interface RankedAccount {
  userId: string;
  rank: number;
}

const PROPIAS: ReadonlySet<MemberAction> = new Set(['EDIT_PROFILE', 'CHANGE_PLAN']);
const ENTRE_PARES: ReadonlySet<MemberAction> = new Set([
  'EDIT_PROFILE',
  'CHANGE_PLAN',
  'CHANGE_STATUS',
  'RESET_PASSWORD',
]);

/** Código del rechazo, o `null` si está permitido. */
export function memberActionDenial(
  actor: RankedAccount,
  target: RankedAccount,
  action: MemberAction,
): string | null {
  if (actor.userId === target.userId) {
    return PROPIAS.has(action) ? null : 'CANNOT_MODIFY_SELF';
  }
  if (target.rank > actor.rank) {
    return 'ROLE_ABOVE_YOURS';
  }
  if (target.rank === actor.rank && !ENTRE_PARES.has(action)) {
    // Mismos códigos que antes de la jerarquía: los clientes ya los explican.
    return action === 'DELETE' ? 'ADMIN_CANNOT_BE_DELETED' : 'ADMIN_CANNOT_BE_DEMOTED';
  }
  return null;
}

/** Lo que la interfaz puede ofrecer sobre esa cuenta. */
export function allowedMemberActions(actor: RankedAccount, target: RankedAccount): MemberAction[] {
  return MEMBER_ACTIONS.filter((action) => memberActionDenial(actor, target, action) === null);
}

/** Se puede asignar un rol de rango igual o inferior al propio, nunca superior. */
export function canAssignRole(actorRank: number, roleRank: number): boolean {
  return roleRank <= actorRank;
}
