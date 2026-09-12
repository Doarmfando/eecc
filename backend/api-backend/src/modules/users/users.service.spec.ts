import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MembershipRole, MembershipStatus, Prisma, UserStatus } from '@prisma/client';

import type { PrismaService } from '../../common/prisma/prisma.service';
import { verifyPassword } from '../auth/password-hash';
import type { StatementRetentionService } from '../statements/statement-retention.service';
import { UsersService } from './users.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTRA_ORGANIZACION = '99999999-9999-4999-8999-999999999999';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const MIEMBRO_ID = '33333333-3333-4333-8333-333333333333';
const CLAVE_ELEGIDA = 'una-clave-elegida-larga';

interface Dobles {
  service: UsersService;
  usuarioBuscado: jest.Mock;
  usuarioCreado: jest.Mock;
  usuarioActualizado: jest.Mock;
  usuarioBorrado: jest.Mock;
  membresiaCreada: jest.Mock;
  membresiaActualizada: jest.Mock;
  membresiaBorrada: jest.Mock;
  membresiasContadas: jest.Mock;
  listado: jest.Mock;
  sesionesRevocadas: jest.Mock;
  auditoria: jest.Mock;
  documentosBorrados: jest.Mock;
}

function usuarioFila(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: MIEMBRO_ID,
    emailNormalized: 'persona@empresa.pe',
    displayName: 'Persona de prueba',
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    _count: { statements: 2 },
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
    /** Lo que devuelve la búsqueda de usuario por correo. */
    usuarioExistente?: Record<string, unknown> | null;
    membresiaExistente?: Record<string, unknown> | null;
    /** Membresías del usuario en otras organizaciones. */
    otrasMembresias?: number;
    falloAlActualizar?: Error;
    falloAlBorrarDocumentos?: Error;
  } = {},
): Dobles {
  const usuarioBuscado = jest.fn().mockResolvedValue(opciones.usuarioExistente ?? null);
  const usuarioCreado = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve(usuarioFila({ ...args.data, id: MIEMBRO_ID })),
  );
  const usuarioActualizado = opciones.falloAlActualizar
    ? jest.fn().mockRejectedValue(opciones.falloAlActualizar)
    : jest.fn().mockResolvedValue(usuarioFila());
  const usuarioBorrado = jest.fn().mockResolvedValue({});
  const membresiaCreada = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve(
      membresiaFila({ role: args.data.role, user: usuarioFila({ _count: { statements: 0 } }) }),
    ),
  );
  const membresiaActualizada = jest.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve(membresiaFila({ ...args.data })),
  );
  const membresiaBorrada = jest.fn().mockResolvedValue({});
  const membresiasContadas = jest.fn().mockResolvedValue(opciones.otrasMembresias ?? 0);
  const listado = jest.fn().mockResolvedValue([membresiaFila()]);
  const sesionesRevocadas = jest.fn().mockResolvedValue({ count: 1 });
  const auditoria = jest.fn().mockResolvedValue({});
  const documentosBorrados = opciones.falloAlBorrarDocumentos
    ? jest.fn().mockRejectedValue(opciones.falloAlBorrarDocumentos)
    : jest.fn().mockResolvedValue(2);

  const cliente = {
    user: {
      findUnique: usuarioBuscado,
      create: usuarioCreado,
      update: usuarioActualizado,
      delete: usuarioBorrado,
    },
    organizationMembership: {
      findMany: listado,
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opciones.membresiaExistente === undefined ? membresiaFila() : opciones.membresiaExistente,
        ),
      create: membresiaCreada,
      update: membresiaActualizada,
      delete: membresiaBorrada,
      count: membresiasContadas,
    },
    session: { updateMany: sesionesRevocadas },
    auditEvent: { create: auditoria },
  };

  const prisma = {
    ...cliente,
    // Acepta las dos formas de transacción: la de función y la de lista.
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: unknown) => Promise<unknown>)(cliente);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  } as unknown as PrismaService;

  const retention = {
    removeAllForUploader: documentosBorrados,
  } as unknown as StatementRetentionService;

  return {
    service: new UsersService(prisma, retention),
    usuarioBuscado,
    usuarioCreado,
    usuarioActualizado,
    usuarioBorrado,
    membresiaCreada,
    membresiaActualizada,
    membresiaBorrada,
    membresiasContadas,
    listado,
    sesionesRevocadas,
    auditoria,
    documentosBorrados,
  };
}

describe('UsersService.list', () => {
  it('describe a cada persona con sus documentos y sin exponer su contraseña', async () => {
    const { service } = construir();

    const miembros = await service.list(ORGANIZATION_ID);

    expect(miembros).toEqual([
      {
        userId: MIEMBRO_ID,
        email: 'persona@empresa.pe',
        displayName: 'Persona de prueba',
        role: MembershipRole.MEMBER,
        status: UserStatus.ACTIVE,
        membershipStatus: MembershipStatus.ACTIVE,
        documentCount: 2,
        lastLoginAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(miembros)).not.toContain('passwordHash');
  });

  it('cuenta solo los documentos de esta organización', async () => {
    // Una persona con cuenta en dos organizaciones no debe mostrar aquí lo que
    // subió en la otra: sería revelar actividad ajena.
    const { service, listado } = construir();

    await service.list(ORGANIZATION_ID);

    const consulta = listado.mock.calls[0]?.[0] as {
      include: { user: { include: { _count: { select: { statements: { where: unknown } } } } } };
    };
    expect(consulta.include.user.include._count.select.statements.where).toEqual(
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    );
  });
});

describe('UsersService.create', () => {
  const datos = {
    email: '  Persona@Empresa.PE ',
    displayName: '  Persona de prueba  ',
    role: MembershipRole.MEMBER,
  };

  it('genera una contraseña temporal que nunca se guarda en claro', async () => {
    const { service, usuarioCreado } = construir();

    const resultado = await service.create(ORGANIZATION_ID, ACTOR_ID, datos);

    expect(resultado.temporaryPassword).toHaveLength(21);
    const guardado = usuarioCreado.mock.calls[0]?.[0] as { data: Record<string, string> };
    expect(guardado.data.passwordHash).not.toContain(resultado.temporaryPassword);
    // El hash tiene que corresponder de verdad a la clave entregada; si no, la
    // persona recibiría una contraseña con la que no puede entrar.
    await expect(
      verifyPassword(resultado.temporaryPassword ?? '', guardado.data.passwordHash ?? ''),
    ).resolves.toBe(true);
  });

  it('usa la contraseña que elige quien administra y no la devuelve', async () => {
    const { service, usuarioCreado } = construir();

    const resultado = await service.create(ORGANIZATION_ID, ACTOR_ID, {
      ...datos,
      password: CLAVE_ELEGIDA,
    });

    // Quien la eligió ya la conoce: devolverla solo multiplicaría los sitios por
    // donde viaja una contraseña en claro.
    expect(resultado.temporaryPassword).toBeNull();
    const guardado = usuarioCreado.mock.calls[0]?.[0] as { data: Record<string, string> };
    await expect(verifyPassword(CLAVE_ELEGIDA, guardado.data.passwordHash ?? '')).resolves.toBe(
      true,
    );
  });

  it('crea administradores cuando se pide', async () => {
    const { service, membresiaCreada } = construir();

    const resultado = await service.create(ORGANIZATION_ID, ACTOR_ID, {
      ...datos,
      role: MembershipRole.ADMIN,
    });

    expect(membresiaCreada).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: MembershipRole.ADMIN }) }),
    );
    expect(resultado.member.role).toBe(MembershipRole.ADMIN);
    expect(resultado.member.documentCount).toBe(0);
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

    const resultado = await service.create(ORGANIZATION_ID, ACTOR_ID, {
      ...datos,
      password: CLAVE_ELEGIDA,
    });

    expect(usuarioCreado).not.toHaveBeenCalled();
    expect(membresiaCreada).toHaveBeenCalled();
    // Cambiarla dejaría fuera a esa persona de la otra organización.
    expect(resultado.temporaryPassword).toBeNull();
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

describe('UsersService.update', () => {
  it('cambia nombre y correo, normalizando el correo', async () => {
    const { service, usuarioActualizado } = construir();

    await service.update(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, {
      displayName: '  Nombre nuevo ',
      email: ' Nuevo@Empresa.PE',
    });

    expect(usuarioActualizado).toHaveBeenCalledWith({
      where: { id: MIEMBRO_ID },
      data: { displayName: 'Nombre nuevo', emailNormalized: 'nuevo@empresa.pe' },
    });
  });

  it('no escribe nada cuando lo enviado coincide con lo guardado', async () => {
    const { service, usuarioActualizado, membresiaActualizada, auditoria } = construir();

    const resultado = await service.update(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, {
      displayName: 'Persona de prueba',
      email: 'PERSONA@empresa.pe',
      role: MembershipRole.MEMBER,
      membershipStatus: MembershipStatus.ACTIVE,
    });

    expect(resultado.email).toBe('persona@empresa.pe');
    expect(usuarioActualizado).not.toHaveBeenCalled();
    expect(membresiaActualizada).not.toHaveBeenCalled();
    expect(auditoria).not.toHaveBeenCalled();
  });

  it('rechaza un correo que ya usa otra persona', async () => {
    const { service, usuarioActualizado } = construir({
      usuarioExistente: usuarioFila({ id: ACTOR_ID }),
    });

    await expect(
      service.update(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, { email: 'ocupado@empresa.pe' }),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_ALREADY_IN_USE' } });
    expect(usuarioActualizado).not.toHaveBeenCalled();
  });

  it('traduce la carrera por el mismo correo a un conflicto y no a un 500', async () => {
    const { service } = construir({
      falloAlActualizar: new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    });

    await expect(
      service.update(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, { email: 'libre@empresa.pe' }),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_ALREADY_IN_USE' } });
  });

  it('deja pasar cualquier otro fallo tal cual', async () => {
    const { service } = construir({ falloAlActualizar: new Error('conexión perdida') });

    await expect(
      service.update(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, { displayName: 'Otro nombre' }),
    ).rejects.toThrow('conexión perdida');
  });

  it('no cambia datos de una cuenta que también usa otra organización', async () => {
    // Si pudiera, el administrador de una organización tomaría la cuenta que esa
    // persona usa en la otra cambiándole el correo.
    const { service, usuarioActualizado } = construir({ otrasMembresias: 1 });

    await expect(
      service.update(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, { displayName: 'Otro nombre' }),
    ).rejects.toMatchObject({ response: { code: 'MEMBER_IN_OTHER_ORGANIZATION' } });
    expect(usuarioActualizado).not.toHaveBeenCalled();
  });

  it('nunca degrada a un administrador', async () => {
    // Si pudiera, eliminarlo quedaría a dos pasos: degradarlo y después eliminarlo.
    const { service, membresiaActualizada } = construir({
      membresiaExistente: membresiaFila({ role: MembershipRole.ADMIN }),
    });

    await expect(
      service.update(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, { role: MembershipRole.MEMBER }),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_CANNOT_BE_DEMOTED' } });
    expect(membresiaActualizada).not.toHaveBeenCalled();
  });

  it('asciende a un usuario a administrador', async () => {
    const { service, membresiaActualizada } = construir();

    const resultado = await service.update(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, {
      role: MembershipRole.ADMIN,
    });

    expect(membresiaActualizada).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: MembershipRole.ADMIN } }),
    );
    expect(resultado.role).toBe(MembershipRole.ADMIN);
  });

  it('no deja a nadie quitarse el acceso ni cambiarse el rol', async () => {
    const { service, membresiaActualizada } = construir({
      membresiaExistente: membresiaFila({ userId: ACTOR_ID, user: usuarioFila({ id: ACTOR_ID }) }),
    });

    await expect(
      service.update(ORGANIZATION_ID, ACTOR_ID, ACTOR_ID, {
        membershipStatus: MembershipStatus.REVOKED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(membresiaActualizada).not.toHaveBeenCalled();
  });

  it('sí deja a cada cual corregir su propio nombre', async () => {
    const { service, usuarioActualizado } = construir({
      membresiaExistente: membresiaFila({ userId: ACTOR_ID, user: usuarioFila({ id: ACTOR_ID }) }),
    });

    await service.update(ORGANIZATION_ID, ACTOR_ID, ACTOR_ID, { displayName: 'Mi nombre' });

    expect(usuarioActualizado).toHaveBeenCalled();
  });

  it('al desactivar cierra sus sesiones en el acto', async () => {
    // Si no, quien ya estuviera dentro seguiría trabajando hasta que caducara
    // su cookie, que es justo lo que no debe pasar al retirar a alguien.
    const { service, sesionesRevocadas } = construir();

    await service.update(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, {
      membershipStatus: MembershipStatus.REVOKED,
    });

    expect(sesionesRevocadas).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: MIEMBRO_ID, organizationId: ORGANIZATION_ID, revokedAt: null },
      }),
    );
  });

  it('no toca sesiones cuando solo cambia el nombre', async () => {
    const { service, sesionesRevocadas } = construir();

    await service.update(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, { displayName: 'Otro nombre' });

    expect(sesionesRevocadas).not.toHaveBeenCalled();
  });

  it('audita qué campos cambiaron sin guardar sus valores', async () => {
    const { service, auditoria } = construir();

    await service.update(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, {
      email: 'nuevo@empresa.pe',
      membershipStatus: MembershipStatus.REVOKED,
    });

    const evento = auditoria.mock.calls[0]?.[0] as { data: { metadata: unknown } };
    expect(evento.data.metadata).toEqual({
      fields: ['emailNormalized', 'status'],
      membershipStatus: MembershipStatus.REVOKED,
    });
    expect(JSON.stringify(evento)).not.toContain('nuevo@empresa.pe');
  });

  it('no encuentra a quien no pertenece a la organización', async () => {
    const { service } = construir({ membresiaExistente: null });

    await expect(
      service.update(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, { role: MembershipRole.ADMIN }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsersService.setPassword', () => {
  it('genera una clave, cierra sus sesiones y desbloquea la cuenta', async () => {
    const { service, usuarioActualizado, sesionesRevocadas } = construir();

    const clave = await service.setPassword(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID);

    expect(clave).toMatch(/^eecc-/);
    const escrito = usuarioActualizado.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    await expect(verifyPassword(clave ?? '', String(escrito.data.passwordHash))).resolves.toBe(
      true,
    );
    // Restablecer es la reacción a un robo o a un olvido: las sesiones abiertas
    // dejan de valer, y el bloqueo por intentos fallidos se levanta.
    expect(sesionesRevocadas).toHaveBeenCalled();
    expect(escrito.data.failedAttempts).toBe(0);
    expect(escrito.data.lockedUntil).toBeNull();
  });

  it('fija la clave que elige quien administra', async () => {
    const { service, usuarioActualizado } = construir();

    const devuelta = await service.setPassword(
      ORGANIZATION_ID,
      ACTOR_ID,
      MIEMBRO_ID,
      CLAVE_ELEGIDA,
    );

    expect(devuelta).toBeNull();
    const escrito = usuarioActualizado.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    await expect(verifyPassword(CLAVE_ELEGIDA, String(escrito.data.passwordHash))).resolves.toBe(
      true,
    );
  });

  it('no cambia la propia contraseña por esta vía', async () => {
    // La propia se cambia desde la cuenta, que exige conocer la actual.
    const { service, usuarioActualizado } = construir();

    await expect(
      service.setPassword(ORGANIZATION_ID, ACTOR_ID, ACTOR_ID, CLAVE_ELEGIDA),
    ).rejects.toMatchObject({ response: { code: 'CANNOT_MODIFY_SELF' } });
    expect(usuarioActualizado).not.toHaveBeenCalled();
  });

  it('no toca la contraseña de una cuenta que también usa otra organización', async () => {
    const { service, usuarioActualizado } = construir({ otrasMembresias: 1 });

    await expect(service.setPassword(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID)).rejects.toMatchObject({
      response: { code: 'MEMBER_IN_OTHER_ORGANIZATION' },
    });
    expect(usuarioActualizado).not.toHaveBeenCalled();
  });

  it('no restablece la contraseña de alguien de otra organización', async () => {
    const { service, usuarioActualizado } = construir({ membresiaExistente: null });

    await expect(
      service.setPassword(OTRA_ORGANIZACION, ACTOR_ID, MIEMBRO_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(usuarioActualizado).not.toHaveBeenCalled();
  });
});

describe('UsersService.remove', () => {
  it('nunca elimina a un administrador', async () => {
    const { service, membresiaActualizada, documentosBorrados, membresiaBorrada } = construir({
      membresiaExistente: membresiaFila({ role: MembershipRole.ADMIN }),
    });

    await expect(service.remove(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID)).rejects.toMatchObject({
      response: { code: 'ADMIN_CANNOT_BE_DELETED' },
    });
    // Ni siquiera se le desactiva de camino: el rechazo no deja rastro.
    expect(membresiaActualizada).not.toHaveBeenCalled();
    expect(documentosBorrados).not.toHaveBeenCalled();
    expect(membresiaBorrada).not.toHaveBeenCalled();
  });

  it('le cierra el paso antes de borrar sus documentos, y después la cuenta', async () => {
    const {
      service,
      membresiaActualizada,
      sesionesRevocadas,
      documentosBorrados,
      membresiaBorrada,
      usuarioBorrado,
    } = construir();

    await expect(service.remove(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID)).resolves.toBe(2);

    expect(membresiaActualizada).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: MembershipStatus.REVOKED } }),
    );
    expect(documentosBorrados).toHaveBeenCalledWith(ORGANIZATION_ID, MIEMBRO_ID);
    // Mientras se borran sus archivos no puede estar subiendo otro.
    const orden = (mock: jest.Mock): number => mock.mock.invocationCallOrder[0] ?? 0;
    expect(orden(sesionesRevocadas)).toBeLessThan(orden(documentosBorrados));
    expect(orden(documentosBorrados)).toBeLessThan(orden(membresiaBorrada));
    expect(usuarioBorrado).toHaveBeenCalledWith({ where: { id: MIEMBRO_ID } });
  });

  it('conserva la cuenta si la persona pertenece a otra organización', async () => {
    const { service, membresiaBorrada, usuarioBorrado } = construir({ otrasMembresias: 1 });

    await service.remove(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID);

    expect(membresiaBorrada).toHaveBeenCalled();
    expect(usuarioBorrado).not.toHaveBeenCalled();
  });

  it('si fallan los documentos deja la cuenta desactivada, no a medio borrar', async () => {
    const { service, membresiaActualizada, membresiaBorrada } = construir({
      falloAlBorrarDocumentos: new Error('disco no disponible'),
    });

    await expect(service.remove(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID)).rejects.toThrow();
    expect(membresiaActualizada).toHaveBeenCalled();
    expect(membresiaBorrada).not.toHaveBeenCalled();
  });

  it('deja constancia de la eliminación y de cuántos documentos arrastró', async () => {
    const { service, auditoria } = construir();

    await service.remove(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID, 'req-9');

    expect(auditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'member.deleted',
          actorUserId: ACTOR_ID,
          entityId: MIEMBRO_ID,
          requestId: 'req-9',
          metadata: { documentsDeleted: 2 },
        }),
      }),
    );
  });

  it('no encuentra a quien no pertenece a la organización', async () => {
    const { service } = construir({ membresiaExistente: null });

    await expect(service.remove(ORGANIZATION_ID, ACTOR_ID, MIEMBRO_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
