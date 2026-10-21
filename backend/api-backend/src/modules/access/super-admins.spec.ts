import type { PrismaClient } from '@prisma/client';

import { verifyPassword } from '../auth/password-hash';
import { ensureSuperAdmins, nombreDesdeCorreo } from './super-admins';

const ORG = '11111111-1111-4111-8111-111111111111';

interface Membresia {
  organizationId: string;
  userId: string;
  roleCode: string;
  planCode: string;
  status: string;
}

interface Usuario {
  id: string;
  emailNormalized: string;
  displayName: string;
  passwordHash: string;
  status: string;
}

/** Base en memoria: lo justo para comprobar que repetir no duplica ni cambia nada. */
function base(): {
  prisma: PrismaClient;
  usuarios: Map<string, Usuario>;
  membresias: Membresia[];
  auditoria: unknown[];
  sesionesRevocadas: jest.Mock;
} {
  const usuarios = new Map<string, Usuario>();
  const membresias: Membresia[] = [];
  const auditoria: unknown[] = [];
  const sesionesRevocadas = jest.fn().mockResolvedValue({ count: 0 });

  const cliente = {
    organization: {
      findFirst: jest.fn().mockResolvedValue({ id: ORG }),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === ORG ? { id: ORG } : null),
      ),
    },
    role: {
      findUnique: jest.fn().mockResolvedValue({ code: 'SUPER_ADMIN', defaultPlanCode: 'ATLAS' }),
    },
    user: {
      findUnique: jest.fn(({ where }: { where: { emailNormalized: string } }) => {
        const usuario = usuarios.get(where.emailNormalized);
        return Promise.resolve(
          usuario
            ? {
                ...usuario,
                memberships: membresias.filter((m) => m.userId === usuario.id),
              }
            : null,
        );
      }),
      create: jest.fn(
        ({
          data,
        }: {
          data: Omit<Usuario, 'id'> & {
            memberships: { create: Omit<Membresia, 'userId' | 'status'> };
          };
        }) => {
          const id = `u${String(usuarios.size + 1)}`;
          const { memberships, ...resto } = data;
          usuarios.set(data.emailNormalized, { ...resto, id } as Usuario);
          membresias.push({ ...memberships.create, userId: id, status: 'ACTIVE' });
          return Promise.resolve({ id });
        },
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<Usuario> }) => {
        for (const usuario of usuarios.values()) {
          if (usuario.id === where.id) Object.assign(usuario, data);
        }
        return Promise.resolve({});
      }),
    },
    organizationMembership: {
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { organizationId_userId: { userId: string } };
          create: Omit<Membresia, 'status'>;
          update: Partial<Membresia>;
        }) => {
          const actual = membresias.find((m) => m.userId === where.organizationId_userId.userId);
          if (actual) Object.assign(actual, update);
          else membresias.push({ status: 'ACTIVE', ...create });
          return Promise.resolve({});
        },
      ),
    },
    session: { updateMany: sesionesRevocadas },
    auditEvent: {
      create: jest.fn(({ data }: { data: unknown }) => {
        auditoria.push(data);
        return Promise.resolve({});
      }),
    },
  };
  const prisma = {
    ...cliente,
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => Promise<unknown>)(cliente)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaClient;
  return { prisma, usuarios, membresias, auditoria, sesionesRevocadas };
}

describe('ensureSuperAdmins', () => {
  it('crea las cuentas con contraseña generada que solo se guarda derivada', async () => {
    const { prisma, usuarios, membresias } = base();

    const resultados = await ensureSuperAdmins(prisma, [
      ' Brando@Hotmail.com',
      'fabio@hotmail.com',
    ]);

    expect(resultados.map((r) => [r.email, r.outcome])).toEqual([
      ['brando@hotmail.com', 'CREATED'],
      ['fabio@hotmail.com', 'CREATED'],
    ]);
    const brando = usuarios.get('brando@hotmail.com');
    expect(brando?.displayName).toBe('Brando');
    expect(brando?.passwordHash).not.toContain(resultados[0]?.password ?? 'x');
    await expect(
      verifyPassword(resultados[0]?.password ?? '', brando?.passwordHash ?? ''),
    ).resolves.toBe(true);
    expect(membresias).toEqual([
      expect.objectContaining({ roleCode: 'SUPER_ADMIN', planCode: 'ATLAS', organizationId: ORG }),
      expect.objectContaining({ roleCode: 'SUPER_ADMIN', planCode: 'ATLAS', organizationId: ORG }),
    ]);
  });

  it('es idempotente: repetir no duplica, no cambia contraseñas ni audita de más', async () => {
    const { prisma, usuarios, membresias, auditoria } = base();
    await ensureSuperAdmins(prisma, ['brando@hotmail.com']);
    const hashAntes = usuarios.get('brando@hotmail.com')?.passwordHash;

    const segunda = await ensureSuperAdmins(prisma, ['brando@hotmail.com', 'BRANDO@hotmail.com']);

    expect(segunda).toEqual([
      { email: 'brando@hotmail.com', outcome: 'UNCHANGED', password: null },
    ]);
    expect(usuarios.size).toBe(1);
    expect(membresias).toHaveLength(1);
    expect(usuarios.get('brando@hotmail.com')?.passwordHash).toBe(hashAntes);
    expect(auditoria).toHaveLength(1);
  });

  it('promueve a una cuenta existente sin tocar su contraseña', async () => {
    const { prisma, usuarios, membresias, auditoria } = base();
    usuarios.set('fabio@hotmail.com', {
      id: 'u-fabio',
      emailNormalized: 'fabio@hotmail.com',
      displayName: 'Fabio',
      passwordHash: 'hash-previo',
      status: 'ACTIVE',
    });
    membresias.push({
      organizationId: ORG,
      userId: 'u-fabio',
      roleCode: 'ADMIN',
      planCode: 'BASICA',
      status: 'REVOKED',
    });

    const [resultado] = await ensureSuperAdmins(prisma, ['fabio@hotmail.com']);

    expect(resultado).toEqual({ email: 'fabio@hotmail.com', outcome: 'PROMOTED', password: null });
    expect(membresias[0]).toMatchObject({
      roleCode: 'SUPER_ADMIN',
      planCode: 'ATLAS',
      status: 'ACTIVE',
    });
    expect(usuarios.get('fabio@hotmail.com')?.passwordHash).toBe('hash-previo');
    expect(JSON.stringify(auditoria)).not.toContain('fabio@hotmail.com');
  });

  it('con --restablecer genera otra contraseña y cierra sus sesiones', async () => {
    const { prisma, usuarios, sesionesRevocadas } = base();
    await ensureSuperAdmins(prisma, ['brando@hotmail.com']);

    const [resultado] = await ensureSuperAdmins(prisma, ['brando@hotmail.com'], {
      resetPasswords: true,
    });

    expect(resultado?.outcome).toBe('PASSWORD_RESET');
    await expect(
      verifyPassword(
        resultado?.password ?? '',
        usuarios.get('brando@hotmail.com')?.passwordHash ?? '',
      ),
    ).resolves.toBe(true);
    expect(sesionesRevocadas).toHaveBeenCalled();
  });

  it('rechaza correos inválidos, una lista vacía y una organización inexistente', async () => {
    const { prisma } = base();
    await expect(ensureSuperAdmins(prisma, [])).rejects.toThrow('correo');
    await expect(ensureSuperAdmins(prisma, ['no-es-correo'])).rejects.toThrow('correo');
    await expect(
      ensureSuperAdmins(prisma, ['brando@hotmail.com'], { organizationId: 'otra' }),
    ).rejects.toThrow('organización');
  });

  it('deriva un nombre legible del correo', () => {
    expect(nombreDesdeCorreo('maria.perez@empresa.pe')).toBe('Maria perez');
    expect(nombreDesdeCorreo('x@empresa.pe')).toBe('X@empresa.pe');
  });
});
