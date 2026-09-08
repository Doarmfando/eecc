import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import type { RequestWithContext } from '../http/request-context';

export const API_KEY_HEADER = 'x-api-key';
const TOKEN_PATTERN = /^[A-Za-z0-9._-]{32,128}$/;

export function hashApiKey(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Resuelve la organización a partir de una credencial de servicio.
 * Solo se compara el hash almacenado; el valor en claro nunca se persiste ni se registra.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const presented = request.header(API_KEY_HEADER);
    if (!presented || !TOKEN_PATTERN.test(presented)) {
      throw new UnauthorizedException({ code: 'API_KEY_REQUIRED' });
    }

    const tokenHash = hashApiKey(presented);

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        organizationId: true,
        status: true,
        tokenHash: true,
        organization: { select: { status: true } },
      },
    });

    if (
      !apiKey ||
      apiKey.status !== 'ACTIVE' ||
      apiKey.organization.status !== 'ACTIVE' ||
      !constantTimeEquals(apiKey.tokenHash, tokenHash)
    ) {
      throw new UnauthorizedException({ code: 'API_KEY_INVALID' });
    }

    // Una credencial de servicio no representa a nadie: sin usuario y sin rol,
    // por lo que `RolesGuard` la rechaza en las rutas de gestión de personas.
    request.organization = {
      organizationId: apiKey.organizationId,
      apiKeyId: apiKey.id,
      userId: null,
      role: null,
    };
    return true;
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
