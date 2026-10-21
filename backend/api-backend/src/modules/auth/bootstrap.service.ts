import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';
import { PLAN, SYSTEM_ROLE } from '../access/access-catalog';
import { ensureSuperAdmins, parseSuperAdminBootstrap } from '../access/super-admins';
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
    if (email && password) {
      const creada = await this.createInitialOwner(normalizeEmail(email), password);
      if (creada) {
        this.logger.warn(
          `Cuenta inicial creada para ${normalizeEmail(email)}. Cambia su contraseña al entrar y retira BOOTSTRAP_ADMIN_PASSWORD del entorno.`,
        );
      }
    }
    // Después de la cuenta inicial: en una base vacía es la que crea la organización.
    await this.ensureSuperAdminsFromEnvironment();
  }

  /**
   * Asegura los superadministradores de `BOOTSTRAP_SUPER_ADMINS`. Idempotente: en
   * cada arranque crea solo los que falten y nunca cambia una contraseña existente.
   * Registra cuántos, no quiénes ni con qué contraseña.
   */
  async ensureSuperAdminsFromEnvironment(): Promise<void> {
    const cuentas = parseSuperAdminBootstrap(
      this.config.get('BOOTSTRAP_SUPER_ADMINS', { infer: true }),
    );
    if (cuentas.size === 0) {
      return;
    }
    const resultados = await ensureSuperAdmins(this.prisma, [...cuentas.keys()], {
      initialPasswords: cuentas,
    });
    const cuenta = (outcome: string): number =>
      resultados.filter((resultado) => resultado.outcome === outcome).length;
    this.logger.warn(
      `Superadministradores asegurados: ${String(cuenta('CREATED'))} creados, ${String(cuenta('PROMOTED'))} promovidos, ${String(cuenta('UNCHANGED'))} sin cambios. Retira BOOTSTRAP_SUPER_ADMINS del entorno cuando hayan entrado.`,
    );
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
            // Quien administra usa también todo el producto.
            create: {
              organizationId: organization.id,
              roleCode: SYSTEM_ROLE.ADMIN,
              planCode: PLAN.ATLAS,
            },
          },
        },
      });
    });

    return true;
  }
}
