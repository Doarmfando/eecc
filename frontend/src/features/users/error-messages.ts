import { ApiError } from '@/lib/api-error';

/**
 * Motivos por código. El servidor aplica cada regla; aquí solo se explica, para
 * que un rechazo diga qué hacer en vez de «no se pudo».
 */
const MENSAJES: Record<string, string> = {
  MEMBER_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo en la organización.',
  EMAIL_ALREADY_IN_USE: 'Ese correo ya lo usa otra cuenta.',
  MEMBER_IN_OTHER_ORGANIZATION:
    'Esta cuenta también pertenece a otra organización: su nombre, correo y contraseña no se pueden cambiar desde aquí.',
  ADMIN_CANNOT_BE_DELETED: 'Un administrador no se puede eliminar. Puedes desactivarlo.',
  ADMIN_CANNOT_BE_DEMOTED: 'Un administrador no puede pasar a ser usuario.',
  CANNOT_MODIFY_SELF: 'Ese cambio no se puede hacer sobre tu propia cuenta.',
  MEMBER_NOT_FOUND: 'Esa cuenta ya no existe. Recarga la lista.',
  INSUFFICIENT_ROLE: 'Solo un administrador puede gestionar cuentas.',
  VALIDATION_FAILED: 'Algún dato no tiene un formato válido. Revísalos.',
  NETWORK_ERROR: 'No se pudo contactar con el servidor.',
};

export function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    return MENSAJES[error.code] ?? 'No se pudo completar la operación.';
  }
  return 'No se pudo completar la operación.';
}
