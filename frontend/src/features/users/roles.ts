import type { Role } from '@/lib/session-client';

export const ROLES: readonly Role[] = ['MEMBER', 'ADMIN'];

export const ETIQUETA_ROL: Record<Role, string> = {
  ADMIN: 'Administrador',
  MEMBER: 'Usuario',
};

export const DESCRIPCION_ROL: Record<Role, string> = {
  ADMIN: 'Crea y gestiona cuentas. No se puede eliminar.',
  MEMBER: 'Procesa documentos y consulta el historial.',
};
