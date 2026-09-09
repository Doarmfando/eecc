import type { ConfigService } from '@nestjs/config';
import { MembershipRole } from '@prisma/client';

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';
import { BootstrapService } from './bootstrap.service';
import { verifyPassword } from './password-hash';

const EMAIL = 'admin@empresa.pe';
const PASSWORD = 'contraseña-inicial-larga';

interface Dobles {
  service: BootstrapService;
  crearUsuario: jest.Mock;
  crearOrganizacion: jest.Mock;
}

function construir(
  opciones: {
    usuariosExistentes?: number;
    organizacionExistente?: { id: string } | null;
    email?: string;
    password?: string;
  } = {},
): Dobles {
  const crearUsuario = jest.fn().mockResolvedValue({ id: 'nuevo' });
  const crearOrganizacion = jest.fn().mockResolvedValue({ id: 'org-nueva' });

  const cliente = {
    organization: {
      findFirst: jest.fn().mockResolvedValue(opciones.organizacionExistente ?? null),
      create: crearOrganizacion,
    },
    user: { create: crearUsuario },
  };

  const prisma = {
    user: { count: jest.fn().mockResolvedValue(opciones.usuariosExistentes ?? 0) },
    $transaction: jest.fn((handler: (tx: unknown) => Promise<unknown>) => handler(cliente)),
  } as unknown as PrismaService;

  const valores: Record<string, string> = {
    BOOTSTRAP_ADMIN_EMAIL: opciones.email ?? EMAIL,
    BOOTSTRAP_ADMIN_PASSWORD: opciones.password ?? PASSWORD,
  };
  const config = {
    get: (clave: string): string => valores[clave] ?? '',
  } as unknown as ConfigService<AppConfig, true>;

  return { service: new BootstrapService(prisma, config), crearUsuario, crearOrganizacion };
}

describe('BootstrapService', () => {
  it('crea la persona propietaria cuando la base está vacía', async () => {
    const { service, crearUsuario, crearOrganizacion } = construir();

    await service.onApplicationBootstrap();

    expect(crearOrganizacion).toHaveBeenCalled();
    const datos = crearUsuario.mock.calls[0]?.[0] as {
      data: {
        emailNormalized: string;
        passwordHash: string;
        memberships: { create: { role: string } };
      };
    };
    expect(datos.data.emailNormalized).toBe(EMAIL);
    expect(datos.data.memberships.create.role).toBe(MembershipRole.OWNER);
    // La contraseña se guarda derivada, y debe servir de verdad para entrar.
    expect(datos.data.passwordHash).not.toContain(PASSWORD);
    await expect(verifyPassword(PASSWORD, datos.data.passwordHash)).resolves.toBe(true);
  });

  it('no toca una instalación que ya tiene personas', async () => {
    // La condición es «no hay nadie», no «no está este correo»: así una variable
    // mal puesta no puede añadir una cuenta a una instalación en marcha.
    const { service, crearUsuario } = construir({ usuariosExistentes: 1 });

    await service.onApplicationBootstrap();

    expect(crearUsuario).not.toHaveBeenCalled();
  });

  it('reutiliza la organización si ya existe una', async () => {
    const { service, crearOrganizacion, crearUsuario } = construir({
      organizacionExistente: { id: 'org-previa' },
    });

    await service.onApplicationBootstrap();

    expect(crearOrganizacion).not.toHaveBeenCalled();
    const datos = crearUsuario.mock.calls[0]?.[0] as {
      data: { memberships: { create: { organizationId: string } } };
    };
    expect(datos.data.memberships.create.organizationId).toBe('org-previa');
  });

  it('no hace nada sin las dos variables', async () => {
    for (const opciones of [{ email: '' }, { password: '' }, { email: '', password: '' }]) {
      const { service, crearUsuario } = construir(opciones);
      await service.onApplicationBootstrap();
      expect(crearUsuario).not.toHaveBeenCalled();
    }
  });

  it('normaliza el correo, que es la clave de acceso', async () => {
    const { service, crearUsuario } = construir({ email: '  Admin@Empresa.PE ' });

    await service.onApplicationBootstrap();

    const datos = crearUsuario.mock.calls[0]?.[0] as { data: { emailNormalized: string } };
    expect(datos.data.emailNormalized).toBe(EMAIL);
  });
});
