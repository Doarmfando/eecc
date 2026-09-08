import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipRole } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';
import { hashPassword, normalizeEmail, verifyPassword } from './password-hash';
import { createSessionToken, hashSessionToken } from './session-cookie';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  displayName: string;
  organizationId: string;
  organizationName: string;
  role: MembershipRole;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * Hash de descarte con el mismo coste que uno real.
 *
 * Cuando el correo no existe se verifica igualmente contra este valor. Sin ese
 * trabajo, responder al instante revelaría qué correos están dados de alta: quien
 * lo intente distinguiría un usuario inexistente de una contraseña equivocada solo
 * midiendo el tiempo de respuesta.
 */
let hashSenuelo: string | null = null;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Milisegundos que dura una sesión, para que el controlador ajuste la cookie. */
  sessionMaxAgeMs(): number {
    return this.config.get('SESSION_TTL_HOURS', { infer: true }) * 60 * 60 * 1000;
  }

  async login(emailBruto: string, password: string, requestId?: string): Promise<LoginResult> {
    const email = normalizeEmail(emailBruto);

    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: email },
      include: {
        memberships: {
          where: { status: 'ACTIVE', organization: { status: 'ACTIVE' } },
          include: { organization: { select: { id: true, displayName: true } } },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!user?.passwordHash) {
      await this.quemarTiempo(password);
      this.registrarFallo(email, requestId, 'credencial desconocida');
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.registrarFallo(email, requestId, 'cuenta bloqueada');
      throw new UnauthorizedException({ code: 'ACCOUNT_LOCKED' });
    }

    const correcta = await verifyPassword(password, user.passwordHash);
    if (!correcta) {
      await this.anotarIntentoFallido(user.id, user.failedAttempts);
      this.registrarFallo(email, requestId, 'contraseña incorrecta');
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    if (user.status !== 'ACTIVE') {
      this.registrarFallo(email, requestId, 'cuenta no activa');
      throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED' });
    }

    // Una persona sin membresía activa no tiene a qué organización entrar. Es un
    // caso distinto de la contraseña equivocada y merece su propio código.
    const membership = user.memberships[0];
    if (!membership) {
      this.registrarFallo(email, requestId, 'sin organización activa');
      throw new UnauthorizedException({ code: 'NO_ACTIVE_MEMBERSHIP' });
    }

    const { token, tokenHash } = createSessionToken();
    const expiresAt = new Date(Date.now() + this.sessionMaxAgeMs());

    await this.prisma.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          userId: user.id,
          organizationId: membership.organizationId,
          tokenHash,
          expiresAt,
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), failedAttempts: 0, lockedUntil: null },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: membership.organizationId,
          actorUserId: user.id,
          action: 'session.started',
          entityType: 'user',
          entityId: user.id,
          ...(requestId !== undefined ? { requestId } : {}),
        },
      });
    });

    this.logger.log(`sesión iniciada user=${user.id} org=${membership.organizationId}`);

    return {
      token,
      expiresAt,
      user: {
        userId: user.id,
        email: user.emailNormalized,
        displayName: user.displayName,
        organizationId: membership.organizationId,
        organizationName: membership.organization.displayName,
        role: membership.role,
      },
    };
  }

  /**
   * Resuelve la sesión de una cookie. Devuelve `null` en vez de lanzar: quien
   * llama decide si la ausencia de sesión es un 401 o simplemente "anónimo".
   */
  async resolveSession(token: string): Promise<AuthenticatedUser | null> {
    const registro = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: 'ACTIVE' },
              include: { organization: { select: { id: true, displayName: true, status: true } } },
            },
          },
        },
      },
    });

    if (!registro || registro.revokedAt || registro.expiresAt <= new Date()) {
      return null;
    }
    if (registro.user.status !== 'ACTIVE') {
      return null;
    }

    // La membresía se vuelve a comprobar en cada petición y no se copia en la
    // sesión: si a alguien le revocan el acceso o le cambian el rol, surte efecto
    // en la petición siguiente y no cuando caduque la cookie.
    const membership = registro.user.memberships.find(
      (candidata) =>
        candidata.organizationId === registro.organizationId &&
        candidata.organization.status === 'ACTIVE',
    );
    if (!membership) {
      return null;
    }

    await this.prisma.session.update({
      where: { id: registro.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      userId: registro.userId,
      email: registro.user.emailNormalized,
      displayName: registro.user.displayName,
      organizationId: registro.organizationId,
      organizationName: membership.organization.displayName,
      role: membership.role,
    };
  }

  async logout(token: string): Promise<void> {
    // `updateMany` y no `update`: una cookie caducada o ya cerrada no debe provocar
    // un error, cerrar sesión tiene que salir bien siempre.
    await this.prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Cambiar la contraseña cierra las demás sesiones: es la reacción a un robo. */
  async changePassword(userId: string, actual: string, nueva: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await verifyPassword(actual, user.passwordHash))) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    const passwordHash = await hashPassword(nueva);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordSetAt: new Date(), status: 'ACTIVE' },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async anotarIntentoFallido(userId: string, previos: number): Promise<void> {
    const intentos = previos + 1;
    const bloquear = intentos >= MAX_FAILED_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedAttempts: bloquear ? 0 : intentos,
        ...(bloquear ? { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) } : {}),
      },
    });
  }

  private async quemarTiempo(password: string): Promise<void> {
    hashSenuelo ??= await hashPassword('contraseña-de-descarte-sin-uso-real');
    await verifyPassword(password, hashSenuelo);
  }

  /** Nunca se registra la contraseña ni el motivo exacto llega al cliente. */
  private registrarFallo(email: string, requestId: string | undefined, motivo: string): void {
    const dominio = email.slice(email.indexOf('@'));
    this.logger.warn(
      `inicio de sesión rechazado (${motivo}) dominio=${dominio} request_id=${requestId ?? 'desconocido'}`,
    );
  }
}
