import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MembershipRole, MembershipStatus, UserStatus } from '@prisma/client';

import type { PrismaService } from '../../common/prisma/prisma.service';
import { verifyPassword } from '../auth/password-hash';
import { UsersService } from './users.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTRA_ORGANIZACION = '99999999-9999-4999-8999-999999999999';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const MIEMBRO_ID = '33333333-3333-4333-8333-333333333333';

interface Dobles {
  service: UsersService;
  usuarioCreado: jest.Mock;
  membresiaCreada: jest.Mock;
  membresiaActualizada: jest.Mock;
  usuarioActualizado: jest.Mock;
  sesionesRevocadas: jest.Mock;
  auditoria: jest.Mock;
  propietariosActivos: jest.Mock;
}

function usuarioFila(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: MIEMBRO_ID,
    emailNormalized: 'persona@empresa.pe',
    displayName: 'Persona de prueba',
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    ...overrides,
  };
}

function membresiaFila(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    organizationId: ORGANIZATION_ID,
    userId: MIEMBRO_ID,
    role: MembershipRole.MEMBER,
    status: MembershipStatus.ACTIVE,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    user: usuarioFila(),
    ...overrides,
  };
}

function construir(
  opciones: {
    usuarioExistente?: Record<string, unknown> | null;
    membresiaExistente?: Record<string, unknown> | null;
    propietarios?: number;
  } = {},
): Dobles {
  const usuarioCreado = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve(usuarioFila({ ...args.data, id: MIEMBRO_ID })),
  );
  const membresiaCreada = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve(membresiaFila({ role: args.data.role })),
  );
  const membresiaActualizada = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve(membresiaFila({ ...args.data })),
  );
  const usuarioActualizado = jest.fn().mockResolvedValue(usuarioFila());
  const sesionesRevocadas = jest.fn().mockResolvedValue({ count: 1 });
  const auditoria = jest.fn().mockResolvedValue({});
  const propietariosActivos = jest.fn().mockResolvedValue(opciones.propietarios ?? 2);

  const cliente = {
    user: {
      findUnique: jest.fn().mockResolvedValue(opciones.usuarioExistente ?? null),
      create: usuarioCreado,
      update: usuarioActualizado,
    },
    organizationMembership: {
      findMany: jest.fn().mockResolvedValue([membresiaFila()]),
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opciones.membresiaExistente === undefined ? membresiaFila() : opciones.membresiaExistente,
        ),
      create: membresiaCreada,
      update: membresiaActualizada,
      count: propietariosActivos,
    },
    session: { updateMany: sesionesRevocadas },
    auditEvent: { create: auditoria },
  };

  const prisma = {
    ...cliente,
    // Acepta las dos formas: la de función (create, updateMembership) y la de
    // lista de promesas (resetPassword).
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: unknown) => Promise<unknown>)(cliente);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  } as unknown as PrismaService;

  return {
    service: new UsersService(prisma),
    usuarioCreado,
    membresiaCreada,
    membresiaActualizada,
    usuarioActualizado,
    sesionesRevocadas,
    auditoria,
    propietariosActivos,
  };
}

describe('UsersService.create', () => {
  const datos = {
    email: '  Persona@Empresa.PE ',
    displayName: '  Persona de prueba  ',
    role: MembershipRole.MEMBER,
  };

  it('da de alta con una contraseña temporal que nunca se guarda en claro', async () => {
    const { service, usuarioCreado } = construir();

    const resultado = await service.create(ORGANIZATION_ID, ACTOR_ID, datos);

    expect(resultado.temporaryPassword).toHaveLength(21);
    const guardado = usuarioCreado.mock.calls[0]?.[0] as { data: Record<string, string> };
    expect(guardado.data.passwordHash).not.toContain(resultado.temporaryPassword);
    // El hash tiene que corresponder de verdad a la clave entregada; si no, la
    // persona recibiría una contraseña con la que no puede entrar.
    await expect(
      verifyPassword(resultado.temporaryPassword, guardado.data.passwordHash ?? ''),
    ).resolves.toBe(true);
  });

  it('normaliza el correo y recorta el nombre', async () => {
    const { service, usuarioCreado } = construir();

    await service.create(ORGANIZATION_ID, ACTOR_ID, datos);

    const guardado = usuarioCreado.mock.calls[0]?.[0] as { data: Record<string, string> };
    expect(guardado.data.emailNormalized).toBe('persona@empresa.pe');
    expect(guardado.data.displayName).toBe('Persona de prueba');
  });

  it('rechaza a quien ya pertenece a la organización', async () => {
    const { service } = construir({
      usuarioExistente: usuarioFila({ memberships: [membresiaFila()] }),
    });

    await expect(service.create(ORGANIZATION_ID, ACTOR_ID, datos)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('a quien ya existe en otra organización le añade la membresía sin tocar su contraseña', async () => {
    const { service, usuarioCreado, membresiaCreada } = construir({
      usuarioExistente: usuarioFila({ memberships: [] }),
    });

    const resultado = await service.create(ORGANIZATION_ID, ACTOR_ID, datos);

    expect(usuarioCreado).not.toHaveBeenCalled();
    expect(membresiaCreada).toHaveBeenCalled();
    // Sin contraseña temporal: la suya sigue siendo válida y cambiarla dejaría
    // fuera a esa persona de la otra organización.
    expect(resultado.temporaryPassword).toBe('');
  });

  it('deja constancia de quién hizo el alta', async () => {
    const { service, auditoria } = construir();

    await service.create(ORGANIZATION_ID, ACTOR_ID, datos, 'req-123');

    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          actorUserId: ACTOR_ID,
          action: 'member.created',
          requestId: 'req-123',
        }),
      }),
    );
  });
});

describe('UsersService.updateMembership', () => {
  it('no deja a la organización sin ningún propietario activo', async () => {
    // Sin este freno, degradar al último propietario deja a la organización sin
    // nadie que pueda volver a repartir permisos.
    const { service, membresiaActualizada } = construir({
      membresiaExistente: membresiaFila({ role: MembershipRole.OWNER }),
      propietarios: 1,
    });

    await expect(
      service.updateMembership(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, {
        role: MembershipRole.MEMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(membresiaActualizada).not.toHaveBeenCalled();
  });

  it('permite degradar a un propietario cuando queda otro', async () => {
    const { service, membresiaActualizada } = construir({
      membresiaExistente: membresiaFila({ role: MembershipRole.OWNER }),
      propietarios: 2,
    });

    await service.updateMembership(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, {
      role: MembershipRole.ADMIN,
    });

    expect(membresiaActualizada).toHaveBeenCalled();
  });

  it('al revocar el acceso cierra sus sesiones en el acto', async () => {
    // Si no, quien ya estuviera dentro seguiría trabajando hasta que caducara
    // su cookie, que es justo lo que no debe pasar al retirar a alguien.
    const { service, sesionesRevocadas } = construir();

    await service.updateMembership(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, {
      membershipStatus: MembershipStatus.REVOKED,
    });

    expect(sesionesRevocadas).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MIEMBRO_ID, organizationId: ORGANIZATION_ID, revokedAt: null },
      }),
    );
  });

  it('no toca sesiones cuando solo cambia el rol', async () => {
    const { service, sesionesRevocadas } = construir();

    await service.updateMembership(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, {
      role: MembershipRole.VIEWER,
    });

    expect(sesionesRevocadas).not.toHaveBeenCalled();
  });

  it('no encuentra a quien no pertenece a la organización', async () => {
    const { service } = construir({ membresiaExistente: null });

    await expect(
      service.updateMembership(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, {
        role: MembershipRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsersService.resetPassword', () => {
  it('entrega una clave nueva, cierra sus sesiones y desbloquea la cuenta', async () => {
    const { service, usuarioActualizado, sesionesRevocadas } = construir();

    const clave = await service.resetPassword(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID);

    expect(clave).toMatch(/^eecc-/);
    const escrito = usuarioActualizado.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    await expect(verifyPassword(clave, String(escrito.data.passwordHash))).resolves.toBe(true);
    // Restablecer es la reacción a un robo o a un olvido: las sesiones abiertas
    // dejan de valer, y el bloqueo por intentos fallidos se levanta.
    expect(sesionesRevocadas).toHaveBeenCalled();
    expect(escrito.data.failedAttempts).toBe(0);
    expect(escrito.data.lockedUntil).toBeNull();
  });

  it('no restablece la contraseña de alguien de otra organización', async () => {
    const { service, usuarioActualizado } = construir({ membresiaExistente: null });

    await expect(
      service.resetPassword(OTRA_ORGANIZACION, ACTOR_ID, MIEMBRO_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(usuarioActualizado).not.toHaveBeenCalled();
  });
});

describe('UsersService.list', () => {
  it('describe a cada persona sin exponer su contraseña', async () => {
    const { service } = construir();

    const miembros = await service.list(ORGANIZATION_ID);

    expect(miembros).toHaveLength(1);
    expect(miembros[0]).toEqual({
      userId: MIEMBRO_ID,
      email: 'persona@empresa.pe',
      displayName: 'Persona de prueba',
      role: MembershipRole.MEMBER,
      status: UserStatus.ACTIVE,
      membershipStatus: MembershipStatus.ACTIVE,
      lastLoginAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(JSON.stringify(miembros)).not.toContain('passwordHash');
  });
});
