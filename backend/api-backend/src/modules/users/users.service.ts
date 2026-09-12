import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  Prisma,
  StatementStatus,
  UserStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import { isEmailDomainAllowed, parseEmailDomains, type AppConfig } from '../../config/app-config';
import { hashPassword, normalizeEmail } from '../auth/password-hash';
import { StatementRetentionService } from '../statements/statement-retention.service';

export interface MemberSummary {
  userId: string;
  email: string;
  displayName: string;
  role: MembershipRole;
  status: UserStatus;
  membershipStatus: MembershipStatus;
  /** Documentos que conserva en esta organización. El cupo los limita a unos pocos. */
  documentCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreatedMember {
  member: MemberSummary;
  /**
   * Contraseña generada, mostrada una sola vez. Nula si la fijó quien administra
   * o si la persona ya existía en otra organización.
   */
  temporaryPassword: string | null;
}

export interface MemberChanges {
  displayName?: string;
  email?: string;
  role?: MembershipRole;
  membershipStatus?: MembershipStatus;
}

/** Alfabeto sin caracteres que se confunden al dictar o copiar: 0/O, 1/l/I. */
const ALFABETO = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LONGITUD_TEMPORAL = 16;

/**
 * Gestión de las cuentas de una organización. Solo la alcanza un administrador:
 * lo impone `RolesGuard` en el controlador.
 *
 * Las reglas que protegen a los administradores viven aquí y no en la interfaz:
 * un administrador no se puede eliminar ni degradar, y nadie puede quitarse el
 * acceso a sí mismo. Si solo las aplicara la página, bastaría una petición a mano
 * para saltárselas.
 */
@Injectable()
export class UsersService {
  private readonly dominiosPermitidos: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly retention: StatementRetentionService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.dominiosPermitidos = parseEmailDomains(
      config.get('ALLOWED_EMAIL_DOMAINS', { infer: true }),
    );
  }

  /** La organización solo da de alta correos de los dominios configurados. */
  private exigirDominioPermitido(email: string): void {
    if (!isEmailDomainAllowed(email, this.dominiosPermitidos)) {
      throw new BadRequestException({ code: 'EMAIL_DOMAIN_NOT_ALLOWED' });
    }
  }

  async list(organizationId: string): Promise<MemberSummary[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: incluirUsuario(organizationId),
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map(toMemberSummary);
  }

  /**
   * Da de alta a una persona en la organización de quien la crea.
   *
   * Si no se indica contraseña se genera una temporal, que se devuelve una sola
   * vez: así la definitiva puede no pasar nunca por manos de quien administra.
   */
  async create(
    organizationId: string,
    actorUserId: string,
    datos: { email: string; displayName: string; role: MembershipRole; password?: string },
    requestId?: string,
  ): Promise<CreatedMember> {
    const email = normalizeEmail(datos.email);
    this.exigirDominioPermitido(email);

    const existente = await this.prisma.user.findUnique({
      where: { emailNormalized: email },
      include: { memberships: { where: { organizationId } } },
    });
    if (existente && existente.memberships.length > 0) {
      throw new ConflictException({ code: 'MEMBER_ALREADY_EXISTS' });
    }

    const password = datos.password ?? generarContrasenaTemporal();
    // Una persona que ya existe por pertenecer a otra organización conserva su
    // contraseña: cambiarla la dejaría fuera de la otra.
    const passwordHash = existente ? null : await hashPassword(password);

    const membership = await this.prisma.$transaction(async (tx) => {
      const user =
        existente ??
        (await tx.user.create({
          data: {
            emailNormalized: email,
            displayName: datos.displayName.trim(),
            passwordHash,
            passwordSetAt: new Date(),
            status: UserStatus.ACTIVE,
          },
        }));

      const creada = await tx.organizationMembership.create({
        data: { organizationId, userId: user.id, role: datos.role },
        include: incluirUsuario(organizationId),
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
      temporaryPassword: existente || datos.password !== undefined ? null : password,
    };
  }

  /**
   * Cambia nombre, correo, rol o acceso de una persona.
   *
   * Solo se escribe lo que de verdad cambia, y las reglas se evalúan sobre eso:
   * reenviar el rol que ya tiene un administrador no es degradarlo.
   */
  async update(
    organizationId: string,
    actorUserId: string,
    userId: string,
    cambios: MemberChanges,
    requestId?: string,
  ): Promise<MemberSummary> {
    const membership = await this.buscarMiembro(organizationId, userId);

    const datosUsuario: Prisma.UserUpdateInput = {};
    const displayName = cambios.displayName?.trim();
    if (displayName !== undefined && displayName !== membership.user.displayName) {
      datosUsuario.displayName = displayName;
    }
    const email = cambios.email === undefined ? undefined : normalizeEmail(cambios.email);
    if (email !== undefined && email !== membership.user.emailNormalized) {
      datosUsuario.emailNormalized = email;
    }

    const datosMembresia: Prisma.OrganizationMembershipUpdateInput = {};
    if (cambios.role !== undefined && cambios.role !== membership.role) {
      datosMembresia.role = cambios.role;
    }
    if (cambios.membershipStatus !== undefined && cambios.membershipStatus !== membership.status) {
      datosMembresia.status = cambios.membershipStatus;
    }

    const camposUsuario = Object.keys(datosUsuario);
    const camposMembresia = Object.keys(datosMembresia);
    if (camposUsuario.length === 0 && camposMembresia.length === 0) {
      return toMemberSummary(membership);
    }

    // Cambiarse el rol o quitarse el acceso a uno mismo es la forma más corta de
    // dejar una organización sin nadie que la administre.
    if (userId === actorUserId && camposMembresia.length > 0) {
      throw new BadRequestException({ code: 'CANNOT_MODIFY_SELF' });
    }
    // Si un administrador pudiera degradarse, "no se elimina a un administrador"
    // quedaría a dos clics: degradarlo y después eliminarlo.
    if (datosMembresia.role !== undefined && membership.role === MembershipRole.ADMIN) {
      throw new ConflictException({ code: 'ADMIN_CANNOT_BE_DEMOTED' });
    }
    if (camposUsuario.length > 0) {
      await this.exigirCuentaExclusiva(organizationId, userId);
    }
    if (email !== undefined && datosUsuario.emailNormalized !== undefined) {
      // Solo se exige al cambiarlo: corregir el nombre de una cuenta antigua con
      // otro dominio no debe obligar a cambiarle también el correo.
      this.exigirDominioPermitido(email);
      const otro = await this.prisma.user.findUnique({ where: { emailNormalized: email } });
      if (otro && otro.id !== userId) {
        throw new ConflictException({ code: 'EMAIL_ALREADY_IN_USE' });
      }
    }

    try {
      const actualizada = await this.prisma.$transaction(async (tx) => {
        if (camposUsuario.length > 0) {
          await tx.user.update({ where: { id: userId }, data: datosUsuario });
        }

        const resultado = await tx.organizationMembership.update({
          where: { organizationId_userId: { organizationId, userId } },
          data: datosMembresia,
          include: incluirUsuario(organizationId),
        });

        // Desactivar cierra las sesiones abiertas en el acto. Sin esto, quien ya
        // estuviera dentro seguiría trabajando hasta que caducara su cookie.
        if (datosMembresia.status === MembershipStatus.REVOKED) {
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
            // Qué campos cambiaron, no sus valores: el correo es un dato personal
            // y la auditoría no necesita guardarlo para ser útil.
            metadata: {
              fields: [...camposUsuario, ...camposMembresia],
              ...(cambios.role !== undefined ? { role: cambios.role } : {}),
              ...(cambios.membershipStatus !== undefined
                ? { membershipStatus: cambios.membershipStatus }
                : {}),
            },
          },
        });

        return resultado;
      });

      return toMemberSummary(actualizada);
    } catch (error) {
      // La comprobación previa no cubre la carrera de dos altas simultáneas con el
      // mismo correo; la restricción única de la base sí.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'EMAIL_ALREADY_IN_USE' });
      }
      throw error;
    }
  }

  /**
   * Fija la contraseña de una persona y cierra todas sus sesiones.
   *
   * Sin `password`, genera una temporal y la devuelve; con ella, devuelve `null`
   * porque quien administra ya la conoce. En ambos casos se levanta el bloqueo
   * por intentos fallidos: restablecer es la reacción a un olvido o a un robo.
   */
  async setPassword(
    organizationId: string,
    actorUserId: string,
    userId: string,
    nueva?: string,
    requestId?: string,
  ): Promise<string | null> {
    await this.buscarMiembro(organizationId, userId);
    // La propia contraseña se cambia desde la cuenta, que exige la actual.
    if (userId === actorUserId) {
      throw new BadRequestException({ code: 'CANNOT_MODIFY_SELF' });
    }
    await this.exigirCuentaExclusiva(organizationId, userId);

    const password = nueva ?? generarContrasenaTemporal();
    const passwordHash = await hashPassword(password);

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
          metadata: { generated: nueva === undefined },
        },
      }),
    ]);

    return nueva === undefined ? password : null;
  }

  /**
   * Elimina a una persona de la organización junto con sus documentos.
   *
   * Devuelve cuántos documentos se borraron. Un administrador nunca se elimina:
   * se puede desactivar, que es reversible.
   */
  async remove(
    organizationId: string,
    actorUserId: string,
    userId: string,
    requestId?: string,
  ): Promise<number> {
    const membership = await this.buscarMiembro(organizationId, userId);
    // Cubre también eliminarse a uno mismo: solo un administrador llega aquí.
    if (membership.role === MembershipRole.ADMIN) {
      throw new ConflictException({ code: 'ADMIN_CANNOT_BE_DELETED' });
    }

    // Primero se le cierra el paso. Si el borrado de archivos falla a medias, la
    // cuenta queda desactivada —un estado seguro— y se puede reintentar.
    await this.prisma.$transaction([
      this.prisma.organizationMembership.update({
        where: { organizationId_userId: { organizationId, userId } },
        data: { status: MembershipStatus.REVOKED },
      }),
      this.prisma.session.updateMany({
        where: { userId, organizationId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Los documentos se borran enteros —PDF, resultados y fila— y no se dejan
    // huérfanos: sin dueño, nadie los vería en su historial ni caerían en ningún cupo.
    const documentos = await this.retention.removeAllForUploader(organizationId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMembership.delete({
        where: { organizationId_userId: { organizationId, userId } },
      });
      // La cuenta solo desaparece si no pertenece a ninguna otra organización.
      const otras = await tx.organizationMembership.count({ where: { userId } });
      if (otras === 0) {
        await tx.user.delete({ where: { id: userId } });
      }
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          action: 'member.deleted',
          entityType: 'user',
          entityId: userId,
          ...(requestId !== undefined ? { requestId } : {}),
          metadata: { documentsDeleted: documentos },
        },
      });
    });

    return documentos;
  }

  private async buscarMiembro(
    organizationId: string,
    userId: string,
  ): Promise<MembershipConUsuario> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: incluirUsuario(organizationId),
    });
    if (!membership) {
      throw new NotFoundException({ code: 'MEMBER_NOT_FOUND' });
    }
    return membership;
  }

  /**
   * Nombre, correo y contraseña son de la persona, no de su membresía. Si también
   * pertenece a otra organización, cambiarlos desde aquí permitiría al
   * administrador de una tomar la cuenta que alguien usa en la otra.
   */
  private async exigirCuentaExclusiva(organizationId: string, userId: string): Promise<void> {
    const otras = await this.prisma.organizationMembership.count({
      where: { userId, organizationId: { not: organizationId } },
    });
    if (otras > 0) {
      throw new ConflictException({ code: 'MEMBER_IN_OTHER_ORGANIZATION' });
    }
  }
}

function generarContrasenaTemporal(): string {
  const bytes = randomBytes(LONGITUD_TEMPORAL);
  const cuerpo = Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]).join('');
  // El prefijo asegura pasar la longitud mínima aunque se acorte el alfabeto.
  return `eecc-${cuerpo}`;
}

interface IncluirUsuario {
  user: {
    include: { _count: { select: { statements: { where: Prisma.StatementWhereInput } } } };
  };
}

/** La persona y cuántos documentos conserva en esta organización, en la misma consulta. */
function incluirUsuario(organizationId: string): IncluirUsuario {
  return {
    user: {
      include: {
        _count: {
          select: {
            statements: {
              where: { organizationId, status: { not: StatementStatus.DELETED } },
            },
          },
        },
      },
    },
  };
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
    _count: { statements: number };
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
    documentCount: membership.user._count.statements,
    lastLoginAt: membership.user.lastLoginAt?.toISOString() ?? null,
    createdAt: membership.createdAt.toISOString(),
  };
}
