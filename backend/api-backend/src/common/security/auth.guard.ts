import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';

import { AuthService } from '../../modules/auth/auth.service';
import { SESSION_COOKIE, readCookie } from '../../modules/auth/session-cookie';
import type { RequestWithContext } from '../http/request-context';
import { ApiKeyGuard } from './api-key.guard';

/**
 * Única puerta de entrada a los recursos de una organización.
 *
 * Acepta dos identidades distintas y deja constancia de cuál entró:
 * - una **persona**, por la cookie de sesión, que además queda en `request.user`
 *   para poder atribuirle lo que suba y auditarlo;
 * - un **servicio**, por la credencial `x-api-key`, sin usuario asociado.
 *
 * Se intenta primero la sesión porque es la vía habitual del navegador. La
 * credencial sigue existiendo para integraciones y para el modo sin persistencia,
 * donde no hay tabla de usuarios.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly apiKeyGuard: ApiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();

    const token = readCookie(request.header('cookie'), SESSION_COOKIE);
    if (token) {
      const usuario = await this.auth.resolveSession(token);
      if (usuario) {
        request.user = usuario;
        request.organization = {
          organizationId: usuario.organizationId,
          apiKeyId: null,
          userId: usuario.userId,
          role: usuario.role,
        };
        return true;
      }
      // Una cookie presente pero inválida no cae a la credencial de servicio: es
      // una sesión caducada o revocada, y el cliente debe volver a entrar.
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED' });
    }

    if (request.header('x-api-key')) {
      return this.apiKeyGuard.canActivate(context);
    }

    throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' });
  }
}
