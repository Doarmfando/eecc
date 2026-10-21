import { MembershipStatus, UserStatus, type PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { MIN_PASSWORD_LENGTH, hashPassword, normalizeEmail } from '../auth/password-hash';
import { SYSTEM_ROLE } from './access-catalog';

export type SuperAdminOutcome = 'CREATED' | 'PROMOTED' | 'UNCHANGED' | 'PASSWORD_RESET';

export interface SuperAdminResult {
  email: string;
  outcome: SuperAdminOutcome;
  /** Solo si se generó en esta ejecución; se muestra una vez y no se guarda. */
  password: string | null;
}

export interface EnsureSuperAdminsOptions {
  /** Organización donde se dan de alta. Sin valor, la activa más antigua. */
  organizationId?: string;
  /** Genera una contraseña nueva también para las cuentas que ya existían. */
  resetPasswords?: boolean;
  /**
   * Contraseña inicial de cada cuenta que haya que **crear**, por correo
   * normalizado. Sin ella se genera una. Nunca cambia la de una cuenta existente.
   */
  initialPasswords?: ReadonlyMap<string, string>;
}

type Cliente = Pick<
  PrismaClient,
  | '$transaction'
  | 'organization'
  | 'role'
  | 'user'
  | 'organizationMembership'
  | 'auditEvent'
  | 'session'
>;

const ALFABETO = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Deja esas cuentas como superadministradoras de la organización.
 *
 * Es la única vía para crear el rango más alto: desde la aplicación nadie asigna
 * un rol por encima del suyo, así que el primero tiene que nacer desde el servidor.
 *
 * Idempotente: ejecutarlo de nuevo no crea cuentas ni membresías duplicadas, no
 * cambia contraseñas (salvo que se pida) y no escribe nada si ya está todo como
 * debe. Cada cambio deja un evento de auditoría sin actor, porque lo hizo el
 * servidor y no una persona con sesión.
 */
export async function ensureSuperAdmins(
  prisma: Cliente,
  correos: readonly string[],
  options: EnsureSuperAdminsOptions = {},
): Promise<SuperAdminResult[]> {
  const emails = [...new Set(correos.map(normalizeEmail))];
  const invalido = emails.find((email) => !CORREO.test(email));
  if (invalido !== undefined || emails.length === 0) {
    throw new Error('Indica al menos un correo válido');
  }

  const organizacion = options.organizationId
    ? await prisma.organization.findUnique({ where: { id: options.organizationId } })
    : await prisma.organization.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      });
  if (!organizacion) {
    throw new Error('No hay ninguna organización donde darlos de alta');
  }

  const rol = await prisma.role.findUnique({ where: { code: SYSTEM_ROLE.SUPER_ADMIN } });
  if (!rol?.defaultPlanCode) {
    throw new Error('Falta el rol SUPER_ADMIN o su plan: aplica antes las migraciones');
  }
  const planCode = rol.defaultPlanCode;

  const resultados: SuperAdminResult[] = [];
  for (const email of emails) {
    resultados.push(
      await asegurarCuenta(
        prisma,
        email,
        organizacion.id,
        planCode,
        options.resetPasswords === true,
        options.initialPasswords?.get(email),
      ),
    );
  }
  return resultados;
}

/**
 * `correo:contraseña,correo:contraseña` → correos y contraseñas iniciales.
 *
 * La contraseña va tras el **primer** `:` (puede contener más); no puede llevar
 * comas. Lanza sin repetir ningún valor: el mensaje puede acabar en un registro.
 */
export function parseSuperAdminBootstrap(valor: string): Map<string, string> {
  const cuentas = new Map<string, string>();
  for (const entrada of valor
    .split(',')
    .map((parte) => parte.trim())
    .filter(Boolean)) {
    const separador = entrada.indexOf(':');
    const email = normalizeEmail(separador > 0 ? entrada.slice(0, separador) : '');
    const password = separador > 0 ? entrada.slice(separador + 1) : '';
    if (!CORREO.test(email) || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error('BOOTSTRAP_SUPER_ADMINS: cada entrada debe ser correo:contraseña (12+)');
    }
    cuentas.set(email, password);
  }
  return cuentas;
}

async function asegurarCuenta(
  prisma: Cliente,
  email: string,
  organizationId: string,
  planCode: string,
  restablecer: boolean,
  passwordInicial?: string,
): Promise<SuperAdminResult> {
  const existente = await prisma.user.findUnique({
    where: { emailNormalized: email },
    include: { memberships: { where: { organizationId } } },
  });

  if (!existente) {
    const password = passwordInicial ?? generarContrasena();
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          emailNormalized: email,
          displayName: nombreDesdeCorreo(email),
          passwordHash,
          passwordSetAt: new Date(),
          status: UserStatus.ACTIVE,
          memberships: {
            create: { organizationId, roleCode: SYSTEM_ROLE.SUPER_ADMIN, planCode },
          },
        },
      });
      await auditar(tx, organizationId, user.id, 'member.created', planCode);
    });
    // Si la indicó quien despliega, ya la conoce: no se devuelve para no repetirla.
    return { email, outcome: 'CREATED', password: passwordInicial ? null : password };
  }

  const membresia = existente.memberships[0];
  const yaEsta =
    membresia?.roleCode === SYSTEM_ROLE.SUPER_ADMIN &&
    membresia.planCode === planCode &&
    !membresia.planExpiresOn &&
    membresia.status === MembershipStatus.ACTIVE &&
    existente.status === UserStatus.ACTIVE;

  if (!yaEsta) {
    await prisma.$transaction(async (tx) => {
      await tx.organizationMembership.upsert({
        where: { organizationId_userId: { organizationId, userId: existente.id } },
        create: {
          organizationId,
          userId: existente.id,
          roleCode: SYSTEM_ROLE.SUPER_ADMIN,
          planCode,
        },
        update: {
          roleCode: SYSTEM_ROLE.SUPER_ADMIN,
          status: MembershipStatus.ACTIVE,
          // Un superadministrador no vence (ADR-0017).
          planExpiresOn: null,
          ...(membresia?.planCode === planCode ? {} : { planCode, planChangedAt: new Date() }),
        },
      });
      if (existente.status !== UserStatus.ACTIVE) {
        await tx.user.update({ where: { id: existente.id }, data: { status: UserStatus.ACTIVE } });
      }
      await auditar(tx, organizationId, existente.id, 'member.updated', planCode);
    });
  }

  if (!restablecer) {
    return { email, outcome: yaEsta ? 'UNCHANGED' : 'PROMOTED', password: null };
  }

  const password = generarContrasena();
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: existente.id },
      data: { passwordHash, passwordSetAt: new Date(), failedAttempts: 0, lockedUntil: null },
    }),
    // Como al restablecer desde la gestión: la contraseña nueva cierra las sesiones.
    prisma.session.updateMany({
      where: { userId: existente.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  return { email, outcome: 'PASSWORD_RESET', password };
}

async function auditar(
  tx: Pick<Cliente, 'auditEvent'>,
  organizationId: string,
  userId: string,
  action: 'member.created' | 'member.updated',
  planCode: string,
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      organizationId,
      action,
      entityType: 'user',
      entityId: userId,
      // Sin correo ni nombre: la auditoría registra qué cambió, no quién es.
      metadata: { role: SYSTEM_ROLE.SUPER_ADMIN, planCode, source: 'cli' },
    },
  });
}

/** `brando@hotmail.com` → `Brando`. Se puede corregir después desde la cuenta. */
export function nombreDesdeCorreo(email: string): string {
  const local = email.split('@')[0] ?? email;
  const limpio = local.replace(/[._-]+/g, ' ').trim();
  const nombre = limpio.length >= 2 ? limpio : email;
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

function generarContrasena(): string {
  const bytes = randomBytes(20);
  return `eecc-${Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]).join('')}`;
}
