import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { MembershipRole } from '@prisma/client';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../../modules/auth/auth.service';

export interface OrganizationContext {
  organizationId: string;
  /** Nulo cuando quien entra es una persona y no un servicio. */
  apiKeyId: string | null;
  /** Nulo cuando entra un servicio por credencial: no hay persona detrás. */
  userId: string | null;
  /** Nulo para una credencial de servicio, que no pertenece a ningún rol. */
  role: MembershipRole | null;
}

export interface RequestWithContext extends Request {
  requestId?: string;
  organization?: OrganizationContext;
  user?: AuthenticatedUser;
}

/** Expone el contexto de organización ya validado por el guard. */
export const CurrentOrganization = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OrganizationContext => {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    if (!request.organization) {
      throw new Error('El contexto de organización no fue resuelto por el guard');
    }
    return request.organization;
  },
);

/**
 * La persona autenticada. Solo se puede pedir en rutas que exigen sesión: una
 * credencial de servicio no tiene usuario y aquí fallaría de forma evidente.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    if (!request.user) {
      throw new Error('Esta ruta exige sesión de usuario y el guard no la resolvió');
    }
    return request.user;
  },
);
