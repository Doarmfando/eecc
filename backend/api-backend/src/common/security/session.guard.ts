import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import { AuthService } from '../../modules/auth/auth.service';
import { SESSION_COOKIE, readCookie } from '../../modules/auth/session-cookie';
import type { RequestWithContext } from '../http/request-context';

/**
 * Exige una persona, no un servicio.
 *
 * Las rutas de gestión de usuarios no aceptan credencial de servicio: crear o
 * desactivar cuentas tiene que quedar atribuido a alguien concreto.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const token = readCookie(request.header('cookie'), SESSION_COOKIE);
    if (!token) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' });
    }

    const usuario = await this.auth.resolveSession(token);
    if (!usuario) {
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED' });
    }

    request.user = usuario;
    request.organization = {
      organizationId: usuario.organizationId,
      apiKeyId: null,
      userId: usuario.userId,
      role: usuario.role,
    };
    return true;
  }
}
