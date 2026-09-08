import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, MembershipStatus, UserStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { hashPassword, normalizeEmail } from '../auth/password-hash';

export interface MemberSummary {
  userId: string;
  email: string;
  displayName: string;
  role: MembershipRole;
  status: UserStatus;
  membershipStatus: MembershipStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreatedMember {
  member: MemberSummary;
  /** Contraseña inicial, mostrada una sola vez. No se guarda en claro en ningún sitio. */
  temporaryPassword: string;
}

/** Alfabeto sin caracteres que se confunden al dictar o copiar: 0/O, 1/l/I. */
const ALFABETO = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LONGITUD_TEMPORAL = 16;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<MemberSummary[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map(toMemberSummary);
  }

  /**
   * Da de alta a una persona en la organización de quien la crea.
   *
   * Devuelve una contraseña temporal en lugar de pedir una: así la contraseña
   * definitiva nunca pasa por las manos de quien administra, y la persona la fija
   * ella misma al entrar por primera vez.
   */
  async create(
    organizationId: string,
    actorUserId: string,
    datos: { email: string; displayName: string; role: MembershipRole },
    requestId?: string,
  ): Promise<CreatedMember> {
    const email = normalizeEmail(datos.email);

    const existente = await this.prisma.user.findUnique({
      where: { emailNormalized: email },
      include: { memberships: { where: { organizationId } } },
    });
    if (existente && existente.memberships.length > 0) {
      throw new ConflictException({ code: 'MEMBER_ALREADY_EXISTS' });
    }

    const temporaryPassword = generarContrasenaTemporal();
    const passwordHash = await hashPassword(temporaryPassword);

    const membership = await this.prisma.$transaction(async (tx) => {
      // Una persona puede existir ya por pertenecer a otra organización: en ese
      // caso se le añade la membresía y no se le toca la contraseña.
      const user = existente
        ? existente
        : await tx.user.create({
            data: {
              emailNormalized: email,
              displayName: datos.displayName.trim(),
              passwordHash,
              passwordSetAt: new Date(),
              status: UserStatus.ACTIVE,
            },
          });

      const creada = await tx.organizationMembership.create({
        data: { organizationId, userId: user.id, role: datos.role },
        include: { user: true },
      });

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          action: 'member.created',
          entityType: 'user',
          entityId: user.id,
          ...(requestId !== undefined ? { requestId } : {}),
          metadata: { role: datos.role },
        },
      });

      return creada;
    });

    return {
      member: toMemberSummary(membership),
      // Si la persona ya existía, su contraseña anterior sigue siendo la buena.
      temporaryPassword: existente ? '' : temporaryPassword,
    };
  }

  async updateMembership(
    organizationId: string,
    actorUserId: string,
    userId: string,
    cambios: { role?: MembershipRole; membershipStatus?: MembershipStatus },
    requestId?: string,
  ): Promise<MemberSummary> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new NotFoundException({ code: 'MEMBER_NOT_FOUND' });
    }

    // Quedarse sin ningún propietario activo deja la organización sin quien pueda
    // volver a dar permisos: se comprueba antes de degradar o revocar al último.
    const dejaDeSerPropietario =
      membership.role === MembershipRole.OWNER &&
      ((cambios.role !== undefined && cambios.role !== MembershipRole.OWNER) ||
        cambios.membershipStatus === MembershipStatus.REVOKED);
    if (dejaDeSerPropietario) {
      const propietarios = await this.prisma.organizationMembership.count({
        where: { organizationId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE },
      });
      if (propietarios <= 1) {
        throw new BadRequestException({ code: 'LAST_OWNER' });
      }
    }

    const actualizada = await this.prisma.$transaction(async (tx) => {
      const resultado = await tx.organizationMembership.update({
        where: { organizationId_userId: { organizationId, userId } },
        data: {
          ...(cambios.role !== undefined ? { role: cambios.role } : {}),
          ...(cambios.membershipStatus !== undefined ? { status: cambios.membershipStatus } : {}),
        },
        include: { user: true },
      });

      // Revocar el acceso cierra las sesiones abiertas en el acto. Sin esto, quien
      // ya estuviera dentro seguiría trabajando hasta que caducara su cookie.
      if (cambios.membershipStatus === MembershipStatus.REVOKED) {
        await tx.session.updateMany({
          where: { userId, organizationId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          action: 'member.updated',
          entityType: 'user',
          entityId: userId,
          ...(requestId !== undefined ? { requestId } : {}),
          metadata: { ...cambios },
        },
      });

      return resultado;
    });

    return toMemberSummary(actualizada);
  }

  /** Restablece la contraseña y cierra las sesiones de esa persona. */
  async resetPassword(
    organizationId: string,
    actorUserId: string,
    userId: string,
    requestId?: string,
  ): Promise<string> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new NotFoundException({ code: 'MEMBER_NOT_FOUND' });
    }

    const temporaryPassword = generarContrasenaTemporal();
    const passwordHash = await hashPassword(temporaryPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordSetAt: new Date(), failedAttempts: 0, lockedUntil: null },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          action: 'member.password_reset',
          entityType: 'user',
          entityId: userId,
          ...(requestId !== undefined ? { requestId } : {}),
        },
      }),
    ]);

    return temporaryPassword;
  }
}

function generarContrasenaTemporal(): string {
  const bytes = randomBytes(LONGITUD_TEMPORAL);
  const cuerpo = Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]).join('');
  // El prefijo asegura pasar la longitud mínima aunque se acorte el alfabeto.
  return `eecc-${cuerpo}`;
}

interface MembershipConUsuario {
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: Date;
  user: {
    id: string;
    emailNormalized: string;
    displayName: string;
    status: UserStatus;
    lastLoginAt: Date | null;
  };
}

function toMemberSummary(membership: MembershipConUsuario): MemberSummary {
  return {
    userId: membership.user.id,
    email: membership.user.emailNormalized,
    displayName: membership.user.displayName,
    role: membership.role,
    status: membership.user.status,
    membershipStatus: membership.status,
    lastLoginAt: membership.user.lastLoginAt?.toISOString() ?? null,
    createdAt: membership.createdAt.toISOString(),
  };
}
