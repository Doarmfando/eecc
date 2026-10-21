import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';
import { MembershipStatus, Prisma, StatementStatus, UserStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

import { PrismaService } from '../../common/prisma/prisma.service';
import {
  businessToday,
  fromIsoDate,
  isExpired,
  isValidIsoDate,
  toIsoDate,
} from '../../common/time/business-date';
import { isEmailDomainAllowed, parseEmailDomains, type AppConfig } from '../../config/app-config';
import { AccessService } from '../access/access.service';
import { hashPassword, normalizeEmail } from '../auth/password-hash';
import { StatementRetentionService } from '../statements/statement-retention.service';
import {
  allowedMemberActions,
  canAssignRole,
  memberActionDenial,
  type MemberAction,
  type RankedAccount,
} from './member-rules';

/** Quien gestiona: su cuenta y el rango de su rol. */
export type MemberActor = RankedAccount;

export interface MemberSummary {
  userId: string;
  email: string;
  displayName: string;
  /** Código del rol en el catálogo `roles`. */
  role: string;
  roleName: string;
  roleRank: number;
  /** Membresía: qué vistas usa y con qué límites (ADR-0016). */
  planCode: string;
  planName: string;
  maxRetainedStatements: number;
  maxPagesPerDocument: number | null;
  planChangedAt: string;
  /** Último día de vigencia (`YYYY-MM-DD`); nulo si no vence (ADR-0017). */
  planExpiresOn: string | null;
  /** Ya venció: no puede convertir hasta que la renueven. */
  planExpired: boolean;
  /** Si su rol lleva vencimiento: los administradores no vencen. */
  planExpiryRequired: boolean;
  status: UserStatus;
  membershipStatus: MembershipStatus;
  /** Documentos que conserva en esta organización. El cupo de su membresía los limita. */
  documentCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  /** Lo que quien consulta puede hacer con esta cuenta, según los rangos. */
  actions: MemberAction[];
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
  role?: string;
  planCode?: string;
  /** `YYYY-MM-DD` para renovar o cambiar la vigencia; `null` la quita. */
  planExpiresOn?: string | null;
  membershipStatus?: MembershipStatus;
}

/** Alfabeto sin caracteres que se confunden al dictar o copiar: 0/O, 1/l/I. */
const ALFABETO = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LONGITUD_TEMPORAL = 16;

/**
 * Gestión de las cuentas de una organización. Solo la alcanza quien tiene
 * `USERS_MANAGE`: lo impone `PermissionsGuard` en el controlador.
 *
 * Quién puede hacer qué sobre cada cuenta lo decide el rango de los roles
 * (`member-rules.ts`) y se aplica aquí, no en la interfaz: si solo lo aplicara la
 * página, bastaría una petición a mano para saltárselo.
 */
@Injectable()
export class UsersService {
  private readonly dominiosPermitidos: string[];
  private readonly zonaHoraria: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly retention: StatementRetentionService,
    private readonly access: AccessService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.dominiosPermitidos = parseEmailDomains(
      config.get('ALLOWED_EMAIL_DOMAINS', { infer: true }),
    );
    this.zonaHoraria = config.get('BUSINESS_TIMEZONE', { infer: true });
  }

  /** Día del negocio, para decidir qué vigencias ya pasaron. */
  private hoy(): string {
    return businessToday(this.zonaHoraria);
  }

  /** Una fecha que no existe no se guarda ni se interpreta. */
  private exigirFecha(dia: string): void {
    if (!isValidIsoDate(dia)) {
      throw new BadRequestException({ code: 'PLAN_EXPIRY_INVALID' });
    }
  }

  /** La organización solo da de alta correos de los dominios configurados. */
  private exigirDominioPermitido(email: string): void {
    if (!isEmailDomainAllowed(email, this.dominiosPermitidos)) {
      throw new BadRequestException({ code: 'EMAIL_DOMAIN_NOT_ALLOWED' });
    }
  }

  async list(organizationId: string, actor: MemberActor): Promise<MemberSummary[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: incluirMiembro(organizationId),
      orderBy: { createdAt: 'asc' },
    });
    const hoy = this.hoy();
    return memberships.map((membership) => toMemberSummary(membership, actor, hoy));
  }

  /**
   * Da de alta a una persona en la organización de quien la crea.
   *
   * Si no se indica contraseña se genera una temporal, que se devuelve una sola
   * vez: así la definitiva puede no pasar nunca por manos de quien administra.
   * Sin membresía indicada recibe la que propone su rol o, si no propone ninguna,
   * la predeterminada del catálogo. Nadie da de alta un rol por encima del suyo.
   */
  async create(
    organizationId: string,
    actor: MemberActor,
    datos: {
      email: string;
      displayName: string;
      role: string;
      planCode?: string;
      /** Obligatoria si el rol lleva vencimiento; se ignora si no. */
      planExpiresOn?: string | null;
      password?: string;
    },
    requestId?: string,
  ): Promise<CreatedMember> {
    const email = normalizeEmail(datos.email);
    this.exigirDominioPermitido(email);
    const rol = await this.access.findRole(datos.role);
    if (!canAssignRole(actor.rank, rol.rank)) {
      throw new ForbiddenException({ code: 'ROLE_ABOVE_YOURS' });
    }
    const planCode = await this.access.resolvePlanCode(
      datos.planCode,
      undefined,
      rol.defaultPlanCode,
    );
    // Un usuario normal nace con fecha de vencimiento, y no en el pasado: darlo
    // de alta ya vencido sería una cuenta que no puede hacer nada. Un rol que no
    // vence (los administradores) nunca la lleva, aunque se envíe.
    const hoy = this.hoy();
    let planExpiresOn: string | null = null;
    if (rol.planExpiryRequired) {
      if (!datos.planExpiresOn) {
        throw new BadRequestException({ code: 'PLAN_EXPIRY_REQUIRED' });
      }
      this.exigirFecha(datos.planExpiresOn);
      if (datos.planExpiresOn < hoy) {
        throw new BadRequestException({ code: 'PLAN_EXPIRY_IN_PAST' });
      }
      planExpiresOn = datos.planExpiresOn;
    }

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
        data: {
          organizationId,
          userId: user.id,
          roleCode: datos.role,
          planCode,
          planExpiresOn: planExpiresOn ? fromIsoDate(planExpiresOn) : null,
        },
        include: incluirMiembro(organizationId),
      });

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId: actor.userId,
          action: 'member.created',
          entityType: 'user',
          entityId: user.id,
          ...(requestId !== undefined ? { requestId } : {}),
          metadata: { role: datos.role, planCode, planExpiresOn },
        },
      });

      return creada;
    });

    return {
      member: toMemberSummary(membership, actor, hoy),
      temporaryPassword: existente || datos.password !== undefined ? null : password,
    };
  }

  /**
   * Cambia nombre, correo, rol, membresía o acceso de una persona.
   *
   * Solo se escribe lo que de verdad cambia, y las reglas se evalúan sobre eso:
   * reenviar el rol que ya tiene un administrador no es degradarlo.
   */
  async update(
    organizationId: string,
    actor: MemberActor,
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

    const datosMembresia: Prisma.OrganizationMembershipUncheckedUpdateInput = {};
    if (cambios.role !== undefined && cambios.role !== membership.roleCode) {
      datosMembresia.roleCode = cambios.role;
    }
    if (cambios.membershipStatus !== undefined && cambios.membershipStatus !== membership.status) {
      datosMembresia.status = cambios.membershipStatus;
    }
    const cambiaPlan = cambios.planCode !== undefined && cambios.planCode !== membership.planCode;

    // La vigencia sigue al rol final: uno que no vence la pierde (ascender a
    // administrador la quita); uno que vence conserva la que tenía salvo que se
    // envíe otra. Se permite una fecha pasada: es la forma de cortar el acceso.
    const hoy = this.hoy();
    const rolFinal =
      typeof datosMembresia.roleCode === 'string'
        ? await this.access.findRole(datosMembresia.roleCode)
        : membership.role;
    const vigenciaActual = membership.planExpiresOn ? toIsoDate(membership.planExpiresOn) : null;
    let vigenciaNueva = vigenciaActual;
    if (!rolFinal.planExpiryRequired) {
      vigenciaNueva = null;
    } else if (cambios.planExpiresOn !== undefined) {
      if (cambios.planExpiresOn !== null) {
        this.exigirFecha(cambios.planExpiresOn);
      }
      vigenciaNueva = cambios.planExpiresOn;
    }
    const cambiaVigencia = vigenciaNueva !== vigenciaActual;

    const camposUsuario = Object.keys(datosUsuario);
    const camposMembresia = Object.keys(datosMembresia);
    if (
      camposUsuario.length === 0 &&
      camposMembresia.length === 0 &&
      !cambiaPlan &&
      !cambiaVigencia
    ) {
      return toMemberSummary(membership, actor, hoy);
    }

    // Cada cambio exige su acción: quitarse el acceso o el rol a uno mismo, tocar
    // una cuenta de rango superior o degradar a alguien del mismo rango se
    // rechazan antes de escribir nada.
    const acciones: MemberAction[] = [];
    if (camposUsuario.length > 0) acciones.push('EDIT_PROFILE');
    if (datosMembresia.roleCode !== undefined) acciones.push('CHANGE_ROLE');
    if (datosMembresia.status !== undefined) acciones.push('CHANGE_STATUS');
    // La vigencia es parte de la membresía. Si solo cambia por el rol (ascender
    // la quita), basta con poder cambiar el rol.
    if (cambiaPlan || (cambiaVigencia && datosMembresia.roleCode === undefined)) {
      acciones.push('CHANGE_PLAN');
    }
    exigirAcciones(actor, { userId, rank: membership.role.rank }, acciones);

    if (typeof datosMembresia.roleCode === 'string' && !canAssignRole(actor.rank, rolFinal.rank)) {
      throw new ForbiddenException({ code: 'ROLE_ABOVE_YOURS' });
    }
    if (cambiaPlan) {
      datosMembresia.planCode = await this.access.resolvePlanCode(
        cambios.planCode,
        membership.planCode,
      );
      datosMembresia.planChangedAt = new Date();
    }
    if (cambiaVigencia) {
      datosMembresia.planExpiresOn = vigenciaNueva ? fromIsoDate(vigenciaNueva) : null;
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
          include: incluirMiembro(organizationId),
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
            actorUserId: actor.userId,
            action: 'member.updated',
            entityType: 'user',
            entityId: userId,
            ...(requestId !== undefined ? { requestId } : {}),
            // Qué campos cambiaron, no sus valores: el correo es un dato personal
            // y la auditoría no necesita guardarlo para ser útil.
            metadata: {
              fields: [
                ...camposUsuario,
                ...camposMembresia.filter((campo) => campo !== 'planExpiresOn'),
                ...(cambiaPlan ? ['planCode'] : []),
                ...(cambiaVigencia ? ['planExpiresOn'] : []),
              ],
              ...(cambios.role !== undefined ? { role: cambios.role } : {}),
              ...(cambiaPlan ? { planCode: cambios.planCode } : {}),
              // Una fecha no es un dato personal y es lo que soporte necesita ver.
              ...(cambiaVigencia ? { planExpiresOn: vigenciaNueva } : {}),
              ...(cambios.membershipStatus !== undefined
                ? { membershipStatus: cambios.membershipStatus }
                : {}),
            },
          },
        });

        return resultado;
      });

      return toMemberSummary(actualizada, actor, hoy);
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
    actor: MemberActor,
    userId: string,
    nueva?: string,
    requestId?: string,
  ): Promise<string | null> {
    const membership = await this.buscarMiembro(organizationId, userId);
    // La propia contraseña se cambia desde la cuenta, que exige la actual; la de
    // un rango superior, no se cambia.
    exigirAcciones(actor, { userId, rank: membership.role.rank }, ['RESET_PASSWORD']);
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
          actorUserId: actor.userId,
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
   * Devuelve cuántos documentos se borraron. Solo se elimina una cuenta de rango
   * inferior: un administrador no elimina a otro —lo puede desactivar, que es
   * reversible— y un superadministrador sí elimina a un administrador.
   */
  async remove(
    organizationId: string,
    actor: MemberActor,
    userId: string,
    requestId?: string,
  ): Promise<number> {
    const membership = await this.buscarMiembro(organizationId, userId);
    exigirAcciones(actor, { userId, rank: membership.role.rank }, ['DELETE']);

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
          actorUserId: actor.userId,
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
      include: incluirMiembro(organizationId),
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

/** Lanza el rechazo de la primera acción que el rango no permite. */
function exigirAcciones(
  actor: MemberActor,
  objetivo: RankedAccount,
  acciones: readonly MemberAction[],
): void {
  for (const accion of acciones) {
    const codigo = memberActionDenial(actor, objetivo, accion);
    if (codigo) {
      throw rechazo(codigo);
    }
  }
}

function rechazo(codigo: string): HttpException {
  if (codigo === 'CANNOT_MODIFY_SELF') {
    return new BadRequestException({ code: codigo });
  }
  if (codigo === 'ROLE_ABOVE_YOURS') {
    return new ForbiddenException({ code: codigo });
  }
  return new ConflictException({ code: codigo });
}

function generarContrasenaTemporal(): string {
  const bytes = randomBytes(LONGITUD_TEMPORAL);
  const cuerpo = Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]).join('');
  // El prefijo asegura pasar la longitud mínima aunque se acorte el alfabeto.
  return `eecc-${cuerpo}`;
}

const ROL_Y_PLAN = {
  role: { select: { code: true, name: true, rank: true, planExpiryRequired: true } },
  plan: {
    select: { code: true, name: true, maxRetainedStatements: true, maxPagesPerDocument: true },
  },
} as const;

interface IncluirMiembro {
  user: {
    include: { _count: { select: { statements: { where: Prisma.StatementWhereInput } } } };
  };
  role: (typeof ROL_Y_PLAN)['role'];
  plan: (typeof ROL_Y_PLAN)['plan'];
}

/**
 * La persona, su rol, su membresía y cuántos documentos conserva en esta
 * organización, en la misma consulta.
 */
function incluirMiembro(organizationId: string): IncluirMiembro {
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
    ...ROL_Y_PLAN,
  };
}

interface MembershipConUsuario {
  roleCode: string;
  planCode: string;
  planChangedAt: Date;
  planExpiresOn: Date | null;
  status: MembershipStatus;
  createdAt: Date;
  role: { code: string; name: string; rank: number; planExpiryRequired: boolean };
  plan: {
    code: string;
    name: string;
    maxRetainedStatements: number;
    maxPagesPerDocument: number | null;
  };
  user: {
    id: string;
    emailNormalized: string;
    displayName: string;
    status: UserStatus;
    lastLoginAt: Date | null;
    _count: { statements: number };
  };
}

function toMemberSummary(
  membership: MembershipConUsuario,
  actor: MemberActor,
  hoy: string,
): MemberSummary {
  const planExpiresOn = membership.planExpiresOn ? toIsoDate(membership.planExpiresOn) : null;
  return {
    userId: membership.user.id,
    email: membership.user.emailNormalized,
    displayName: membership.user.displayName,
    role: membership.role.code,
    roleName: membership.role.name,
    roleRank: membership.role.rank,
    planCode: membership.plan.code,
    planName: membership.plan.name,
    maxRetainedStatements: membership.plan.maxRetainedStatements,
    maxPagesPerDocument: membership.plan.maxPagesPerDocument,
    planChangedAt: membership.planChangedAt.toISOString(),
    planExpiresOn,
    planExpired: isExpired(planExpiresOn, hoy),
    planExpiryRequired: membership.role.planExpiryRequired,
    status: membership.user.status,
    membershipStatus: membership.status,
    documentCount: membership.user._count.statements,
    lastLoginAt: membership.user.lastLoginAt?.toISOString() ?? null,
    createdAt: membership.createdAt.toISOString(),
    actions: allowedMemberActions(actor, {
      userId: membership.user.id,
      rank: membership.role.rank,
    }),
  };
}
