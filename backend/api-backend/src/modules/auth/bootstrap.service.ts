import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipRole, UserStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';
import { hashPassword, normalizeEmail } from './password-hash';

const ORGANIZACION_INICIAL = 'Organización';

/**
 * Crea la organización y su administrador cuando la base está vacía.
 *
 * Sin esto, un despliegue recién levantado no tiene por dónde entrar: no hay
 * registro abierto, y en un PaaS la base solo es accesible desde dentro del
 * contenedor. Obligaría a abrir un acceso a la base solo para sembrarla.
 *
 * Solo actúa si **no existe ningún usuario**. Nunca modifica una instalación en
 * marcha: ni crea cuentas de más, ni toca una contraseña existente.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get('BOOTSTRAP_ADMIN_EMAIL', { infer: true });
    const password = this.config.get('BOOTSTRAP_ADMIN_PASSWORD', { infer: true });
    if (!email || !password) {
      return;
    }

    const creada = await this.createInitialOwner(normalizeEmail(email), password);
    if (creada) {
      this.logger.warn(
        `Cuenta inicial creada para ${normalizeEmail(email)}. Cambia su contraseña al entrar y retira BOOTSTRAP_ADMIN_PASSWORD del entorno.`,
      );
    }
  }

  /** Devuelve `true` si creó la cuenta; `false` si ya había alguien. */
  async createInitialOwner(email: string, password: string): Promise<boolean> {
    // La condición es "no hay nadie", no "no está este correo": así una segunda
    // variable mal puesta no puede añadir una cuenta a una instalación viva.
    if ((await this.prisma.user.count()) > 0) {
      return false;
    }

    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      const organization =
        (await tx.organization.findFirst()) ??
        (await tx.organization.create({ data: { displayName: ORGANIZACION_INICIAL } }));

      await tx.user.create({
        data: {
          emailNormalized: email,
          displayName: 'Administración',
          passwordHash,
          passwordSetAt: new Date(),
          status: UserStatus.ACTIVE,
          memberships: {
            create: { organizationId: organization.id, role: MembershipRole.ADMIN },
          },
        },
      });
    });

    return true;
  }
}
