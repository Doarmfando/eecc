import { UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';

import type { AuthService, AuthenticatedUser } from '../../modules/auth/auth.service';
import { SESSION_COOKIE } from '../../modules/auth/session-cookie';
import type { RequestWithContext } from '../http/request-context';
import type { ApiKeyGuard } from './api-key.guard';
import { AuthGuard } from './auth.guard';

const USUARIO: AuthenticatedUser = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'persona@empresa.pe',
  displayName: 'Persona de prueba',
  organizationId: '22222222-2222-4222-8222-222222222222',
  organizationName: 'Organización de prueba',
  role: MembershipRole.ADMIN,
};

function contextoCon(cabeceras: Record<string, string>): {
  context: ExecutionContext;
  request: RequestWithContext;
} {
  const request = {
    headers: cabeceras,
    header: (nombre: string): string | undefined => cabeceras[nombre.toLowerCase()],
  } as unknown as RequestWithContext;

  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
    request,
  };
}

function construir(sesion: AuthenticatedUser | null): {
  guard: AuthGuard;
  resolveSession: jest.Mock;
  apiKeyCanActivate: jest.Mock;
} {
  const resolveSession = jest.fn().mockResolvedValue(sesion);
  const apiKeyCanActivate = jest.fn().mockResolvedValue(true);
  const apiKeyGuard = { canActivate: apiKeyCanActivate } as unknown as ApiKeyGuard & CanActivate;

  return {
    guard: new AuthGuard({ resolveSession } as unknown as AuthService, apiKeyGuard),
    resolveSession,
    apiKeyCanActivate,
  };
}

describe('AuthGuard', () => {
  it('resuelve la persona a partir de la cookie y la deja en la petición', async () => {
    const { guard, apiKeyCanActivate } = construir(USUARIO);
    const { context, request } = contextoCon({ cookie: `${SESSION_COOKIE}=un-token` });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.user).toEqual(USUARIO);
    expect(request.organization).toEqual({
      organizationId: USUARIO.organizationId,
      apiKeyId: null,
      userId: USUARIO.userId,
      role: MembershipRole.ADMIN,
    });
    expect(apiKeyCanActivate).not.toHaveBeenCalled();
  });

  it('una cookie caducada no cae a la credencial de servicio', async () => {
    // Caer a la credencial ocultaría que la sesión expiró: el cliente seguiría
    // trabajando como servicio en lugar de volver a entrar.
    const { guard, apiKeyCanActivate } = construir(null);
    const { context } = contextoCon({
      cookie: `${SESSION_COOKIE}=caducado`,
      'x-api-key': 'k'.repeat(48),
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(apiKeyCanActivate).not.toHaveBeenCalled();
  });

  it('acepta la credencial de servicio cuando no hay cookie', async () => {
    const { guard, apiKeyCanActivate, resolveSession } = construir(null);
    const { context } = contextoCon({ 'x-api-key': 'k'.repeat(48) });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(apiKeyCanActivate).toHaveBeenCalledWith(context);
    expect(resolveSession).not.toHaveBeenCalled();
  });

  it('rechaza a quien no presenta ninguna de las dos', async () => {
    const { guard } = construir(null);
    const { context } = contextoCon({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ignora una cookie de sesión ajena a esta aplicación', async () => {
    const { guard } = construir(USUARIO);
    const { context } = contextoCon({ cookie: 'otra_cookie=valor; theme=dark' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
