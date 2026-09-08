import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restringe una ruta a ciertos roles de la organización.
 *
 * Va siempre junto a `SessionGuard`: una credencial de servicio no tiene rol y no
 * puede alcanzar estas rutas.
 */
export const Roles = (...roles: MembershipRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
