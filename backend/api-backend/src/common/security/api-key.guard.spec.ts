import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';
import type { RequestWithContext } from '../http/request-context';
import { ApiKeyGuard, hashApiKey } from './api-key.guard';

const VALID_TOKEN = 'k'.repeat(48);
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function contextFor(request: Partial<RequestWithContext>): ExecutionContext {
  const full = {
    header: (name: string): string | undefined =>
      (request as { headers?: Record<string, string> }).headers?.[name],
    ...request,
  } as RequestWithContext;
  return {
    switchToHttp: () => ({ getRequest: () => full }),
  } as unknown as ExecutionContext;
}

function guardWith(apiKey: unknown): { guard: ApiKeyGuard; findUnique: jest.Mock } {
  const findUnique = jest.fn().mockResolvedValue(apiKey);
  const prisma = { apiKey: { findUnique } } as unknown as PrismaService;
  return { guard: new ApiKeyGuard(prisma), findUnique };
}

describe('ApiKeyGuard', () => {
  it('resuelve la organización de una credencial activa', async () => {
    const request: Partial<RequestWithContext> = {
      headers: { 'x-api-key': VALID_TOKEN },
    } as unknown as Partial<RequestWithContext>;
    const { guard, findUnique } = guardWith({
      id: 'key-id',
      organizationId: ORGANIZATION_ID,
      status: 'ACTIVE',
      tokenHash: hashApiKey(VALID_TOKEN),
      organization: { status: 'ACTIVE' },
    });
    const context = contextFor(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashApiKey(VALID_TOKEN) } }),
    );
  });

  it('nunca consulta la base con el valor en claro', () => {
    expect(hashApiKey(VALID_TOKEN)).toHaveLength(64);
    expect(hashApiKey(VALID_TOKEN)).not.toContain(VALID_TOKEN);
  });

  it('rechaza credencial ausente o con formato inválido', async () => {
    const { guard, findUnique } = guardWith(null);

    for (const header of [undefined, 'corta', 'con espacios y símbolos $$']) {
      const context = contextFor({
        headers: header === undefined ? {} : { 'x-api-key': header },
      } as unknown as Partial<RequestWithContext>);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rechaza credenciales revocadas o de organizaciones suspendidas', async () => {
    const context = contextFor({
      headers: { 'x-api-key': VALID_TOKEN },
    } as unknown as Partial<RequestWithContext>);

    const revoked = guardWith({
      id: 'key-id',
      organizationId: ORGANIZATION_ID,
      status: 'REVOKED',
      tokenHash: hashApiKey(VALID_TOKEN),
      organization: { status: 'ACTIVE' },
    });
    await expect(revoked.guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);

    const suspended = guardWith({
      id: 'key-id',
      organizationId: ORGANIZATION_ID,
      status: 'ACTIVE',
      tokenHash: hashApiKey(VALID_TOKEN),
      organization: { status: 'SUSPENDED' },
    });
    await expect(suspended.guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const unknown = guardWith(null);
    await expect(unknown.guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
