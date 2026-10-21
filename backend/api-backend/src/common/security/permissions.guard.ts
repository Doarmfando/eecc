import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RequestWithContext } from '../http/request-context';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Restringe una ruta a quien tenga **todos** esos permisos por su rol.
 *
 * Se pregunta por permisos y no por roles para que un rol nuevo sea solo filas en
 * `role_permissions` (ADR-0016). Va siempre detrás del guard que identifica a la
 * persona (`SessionGuard` o `AuthGuard`).
 */
export const RequirePermissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Aplica `RequirePermissions`.
 *
 * Una credencial de servicio no tiene rol: representa a la organización, no a una
 * persona. Pasa en las rutas que admiten `AuthGuard`; las de gestión de personas
 * exigen `SessionGuard`, que ya la rechaza antes de llegar aquí.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const exigidos = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!exigidos || exigidos.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const organizacion = request.organization;
    if (organizacion?.apiKeyId) {
      return true;
    }
    const concedidos = organizacion?.permissions ?? [];
    if (!exigidos.every((permiso) => concedidos.includes(permiso))) {
      // Mismo código que antes de que existieran los permisos: los clientes ya lo
      // traducen como «tu rol no permite hacer esto», que sigue siendo cierto.
      throw new ForbiddenException({ code: 'INSUFFICIENT_ROLE' });
    }
    return true;
  }
}
