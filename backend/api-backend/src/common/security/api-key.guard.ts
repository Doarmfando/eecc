import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';

import type { AppConfig } from '../../config/app-config';
import { isMemoryMode } from '../persistence/persistence-mode';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestWithContext } from '../http/request-context';

export const API_KEY_HEADER = 'x-api-key';
const TOKEN_PATTERN = /^[A-Za-z0-9._-]{32,128}$/;

/** Identificador de la credencial sintética del modo memoria; no existe en ninguna tabla. */
export const EPHEMERAL_API_KEY_ID = '00000000-0000-4000-8000-0000000000ff';

export function hashApiKey(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Resuelve la organización a partir de una credencial de servicio.
 * Solo se compara el hash almacenado; el valor en claro nunca se persiste ni se registra.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const presented = request.header(API_KEY_HEADER);
    if (!presented || !TOKEN_PATTERN.test(presented)) {
      throw new UnauthorizedException({ code: 'API_KEY_REQUIRED' });
    }

    const tokenHash = hashApiKey(presented);

    // Sin base de datos no hay tabla de credenciales: se acepta exactamente una,
    // la configurada, y siempre resuelve a la misma organización.
    if (isMemoryMode(this.config)) {
      const expected = hashApiKey(this.config.get('EPHEMERAL_API_KEY', { infer: true }));
      if (!constantTimeEquals(expected, tokenHash)) {
        throw new UnauthorizedException({ code: 'API_KEY_INVALID' });
      }
      request.organization = {
        organizationId: this.config.get('EPHEMERAL_ORGANIZATION_ID', { infer: true }),
        apiKeyId: EPHEMERAL_API_KEY_ID,
      };
      return true;
    }

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

    request.organization = { organizationId: apiKey.organizationId, apiKeyId: apiKey.id };
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
