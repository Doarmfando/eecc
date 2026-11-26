import { PrismaClient } from '@prisma/client';

import { isValidTimeZone } from '../common/time/business-date';
import { migratePersonal } from './personal-migration';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--apply')) {
    process.stderr.write('Uso: npm run commercial:migrate-personal [-- --apply]\n');
    process.exitCode = 2;
    return;
  }
  const apply = args[0] === '--apply';
  const zone = process.env.BUSINESS_TIMEZONE ?? 'America/Lima';
  if (!isValidTimeZone(zone)) {
    process.stderr.write('BUSINESS_TIMEZONE inválida.\n');
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const resumen = await migratePersonal(prisma, { apply, zone });
    process.stdout.write(
      `${JSON.stringify({ modo: apply ? 'aplicado' : 'simulación', ...resumen }, null, 2)}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const conocidos = [
    'CATALOGO_COMERCIAL_INVALIDO',
    'PLAN_ATLAS_INTERNO_INVALIDO',
    'RESERVAS_PENDIENTES',
  ];
  const codigo =
    error instanceof Error && conocidos.includes(error.message)
      ? error.message
      : 'MIGRACION_COMERCIAL_FALLIDA';
  process.stderr.write(`${codigo}\n`);
  process.exitCode = 1;
});
