import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface OrganizationContext {
  organizationId: string;
  apiKeyId: string;
}

export interface RequestWithContext extends Request {
  requestId?: string;
  organization?: OrganizationContext;
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
