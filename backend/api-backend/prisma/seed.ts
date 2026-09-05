import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Siembra una organización y una credencial de servicio para desarrollo local.
 *
 * La credencial se imprime una sola vez y solo se guarda su hash, igual que en
 * producción. Ejecutar de nuevo reutiliza la organización y emite otra credencial.
 */
const prisma = new PrismaClient();

const ORGANIZATION_NAME = 'Organización de desarrollo';

async function main(): Promise<void> {
  const organization =
    (await prisma.organization.findFirst({ where: { displayName: ORGANIZATION_NAME } })) ??
    (await prisma.organization.create({ data: { displayName: ORGANIZATION_NAME } }));

  const token = randomBytes(24).toString('base64url');
  const apiKey = await prisma.apiKey.create({
    data: {
      organizationId: organization.id,
      label: `local-${new Date().toISOString().slice(0, 10)}`,
      tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
    },
  });

  process.stdout.write(
    [
      `organización: ${organization.id}`,
      `credencial:   ${apiKey.id}`,
      '',
      'Guarda esta credencial ahora; no vuelve a mostrarse:',
      token,
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
