import { MembershipRole, PrismaClient, UserStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

import { hashPassword, normalizeEmail } from '../modules/auth/password-hash';

/**
 * Siembra la organización, su administrador y una credencial de servicio para
 * integraciones.
 *
 * Vive en `src/` y no en `prisma/` para que entre en el compilado: en un contenedor
 * de producción no hay `ts-node`, y crear la primera cuenta es justo lo que hay que
 * hacer allí. Se ejecuta con `node dist/cli/seed.js`.
 *
 * Las claves se imprimen una sola vez y solo se guardan derivadas, igual que en
 * producción. Volver a ejecutarlo reutiliza la organización y la persona, y emite
 * una credencial de servicio nueva.
 *
 * El correo y la contraseña del administrador se pueden fijar con `SEED_ADMIN_EMAIL`
 * y `SEED_ADMIN_PASSWORD`; si no, se genera una contraseña y se muestra al final.
 *
 * Es también la vía de recuperación si se pierde la contraseña del administrador:
 * con `SEED_ADMIN_PASSWORD` puesta a propósito, se aplica aunque la cuenta exista.
 * Sin ella, la contraseña de una cuenta existente nunca se toca.
 */
const prisma = new PrismaClient();

const ORGANIZATION_NAME = 'Organización de desarrollo';
const DEFAULT_ADMIN_EMAIL = 'admin@eecc.local';
const ALFABETO = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generarContrasena(): string {
  const bytes = randomBytes(20);
  return `eecc-${Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]).join('')}`;
}

async function main(): Promise<void> {
  const organization =
    (await prisma.organization.findFirst({ where: { displayName: ORGANIZATION_NAME } })) ??
    (await prisma.organization.create({ data: { displayName: ORGANIZATION_NAME } }));

  const email = normalizeEmail(process.env.SEED_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL);
  const passwordIndicada = process.env.SEED_ADMIN_PASSWORD;
  const password = passwordIndicada ?? generarContrasena();

  const existente = await prisma.user.findUnique({ where: { emailNormalized: email } });
  let mensajeClave: string;

  if (existente) {
    await prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: existente.id } },
      create: { organizationId: organization.id, userId: existente.id, role: MembershipRole.ADMIN },
      update: { role: MembershipRole.ADMIN, status: 'ACTIVE' },
    });

    if (passwordIndicada === undefined) {
      // No se pisa la contraseña de una persona que ya entra: sembrar de nuevo no
      // puede dejar fuera a quien ya estaba usando el sistema.
      mensajeClave = 'La persona ya existía; su contraseña no se ha modificado.';
    } else {
      // Recuperación: quien ejecuta esto dentro del servidor pidió esa contraseña.
      await prisma.$transaction([
        prisma.user.update({
          where: { id: existente.id },
          data: {
            passwordHash: await hashPassword(password),
            passwordSetAt: new Date(),
            status: UserStatus.ACTIVE,
            failedAttempts: 0,
            lockedUntil: null,
          },
        }),
        prisma.session.updateMany({
          where: { userId: existente.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      mensajeClave = 'La persona ya existía; se aplicó la contraseña de SEED_ADMIN_PASSWORD.';
    }
  } else {
    const user = await prisma.user.create({
      data: {
        emailNormalized: email,
        displayName: 'Administración',
        passwordHash: await hashPassword(password),
        passwordSetAt: new Date(),
        status: UserStatus.ACTIVE,
        memberships: {
          create: { organizationId: organization.id, role: MembershipRole.ADMIN },
        },
      },
    });
    mensajeClave = `contraseña:  ${password}`;
    process.stdout.write(`usuario:      ${user.id}\n`);
  }

  const token = randomBytes(24).toString('base64url');
  await prisma.apiKey.create({
    data: {
      organizationId: organization.id,
      label: `local-${new Date().toISOString().slice(0, 10)}`,
      tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
    },
  });

  process.stdout.write(
    [
      '',
      '== Acceso a la aplicación ==',
      `organización: ${organization.displayName}`,
      `correo:       ${email}`,
      mensajeClave,
      '',
      '== Credencial de servicio (integraciones, no para el navegador) ==',
      token,
      '',
      'Guarda estos valores ahora; no vuelven a mostrarse.',
      '',
    ].join('\n'),
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'error desconocido'}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
