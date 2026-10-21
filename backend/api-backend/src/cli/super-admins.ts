import { PrismaClient } from '@prisma/client';

import { ensureSuperAdmins, type SuperAdminOutcome } from '../modules/access/super-admins';

/**
 * Crea o promueve cuentas de superadministrador (ADR-0016).
 *
 *   npm run access:super-admins -- brando@hotmail.com fabio@hotmail.com
 *   node dist/cli/super-admins.js brando@hotmail.com fabio@hotmail.com   # producción
 *
 * Opciones: `--organizacion <id>` para elegir la organización (por defecto, la
 * activa más antigua) y `--restablecer` para generar contraseña nueva también a
 * las cuentas que ya existían. Las contraseñas generadas se muestran una sola vez
 * y solo se guardan derivadas.
 *
 * Vive en `src/` para que entre en el compilado, como la semilla: en el contenedor
 * de producción no hay `ts-node`.
 */
const ETIQUETAS: Record<SuperAdminOutcome, string> = {
  CREATED: 'creada',
  PROMOTED: 'promovida a superadministrador',
  UNCHANGED: 'ya era superadministrador; sin cambios',
  PASSWORD_RESET: 'contraseña restablecida',
};

function leerArgumentos(argv: readonly string[]): {
  correos: string[];
  organizationId?: string;
  resetPasswords: boolean;
} {
  const correos: string[] = [];
  let organizationId: string | undefined;
  let resetPasswords = false;
  for (let i = 0; i < argv.length; i += 1) {
    const actual = argv[i] ?? '';
    if (actual === '--restablecer') {
      resetPasswords = true;
    } else if (actual === '--organizacion') {
      organizationId = argv[i + 1];
      i += 1;
    } else {
      correos.push(actual);
    }
  }
  return { correos, ...(organizationId ? { organizationId } : {}), resetPasswords };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const { correos, ...opciones } = leerArgumentos(process.argv.slice(2));
    const resultados = await ensureSuperAdmins(prisma, correos, opciones);
    const lineas = ['', '== Superadministradores =='];
    for (const resultado of resultados) {
      lineas.push(`${resultado.email}: ${ETIQUETAS[resultado.outcome]}`);
      if (resultado.password) {
        lineas.push(`  contraseña: ${resultado.password}`);
      }
    }
    if (resultados.some((resultado) => resultado.password)) {
      lineas.push('', 'Entrégalas ahora y pide cambiarlas al entrar; no vuelven a mostrarse.');
    }
    process.stdout.write(`${lineas.join('\n')}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'error desconocido'}\n`);
  process.exitCode = 1;
});
