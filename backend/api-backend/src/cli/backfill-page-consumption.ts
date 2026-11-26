import { JobAttemptStatus, PrismaClient } from '@prisma/client';

/**
 * Rellena `page_consumption_entries` con los intentos que ya existen, para los
 * documentos que todavía no se han borrado (ADR-0018, anexo de integridad del
 * cobro).
 *
 *   npm run backfill:page-consumption            # dev
 *   node dist/cli/backfill-page-consumption.js    # producción, tras aplicar la migración
 *
 * Manual, no se ejecuta solo al desplegar: se corre una sola vez después de
 * aplicar la migración `consumo_de_paginas_independiente`, en cada entorno que
 * tenga datos de antes de ese cambio. Volver a correrlo no duplica nada: el
 * índice único `(organization_id, job_attempt_id)` lo impide (`skipDuplicates`).
 *
 * Límite conocido, no se intenta adivinar: un intento cuyo documento ya se
 * había borrado ANTES de este fix no deja ningún rastro que reconstruir — su
 * `job`/`job_attempt` se borraron en cascada con el `statement`. Ese consumo ya
 * perdido no se compensa con una estimación; queda fuera del acumulado desde
 * ahora en adelante, igual que ya estaba fuera antes de correr este script.
 */
const ESTADOS_QUE_CONSUMEN: JobAttemptStatus[] = [
  JobAttemptStatus.SUCCEEDED,
  JobAttemptStatus.NEEDS_REVIEW,
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const intentos = await prisma.jobAttempt.findMany({
      where: {
        status: { in: ESTADOS_QUE_CONSUMEN },
        pageCount: { not: null },
        job: { statement: { uploadedById: { not: null } } },
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        pageCount: true,
        finishedAt: true,
        startedAt: true,
        job: { select: { statement: { select: { id: true, uploadedById: true } } } },
      },
    });

    const { count } = await prisma.pageConsumptionEntry.createMany({
      data: intentos.map((intento) => ({
        organizationId: intento.organizationId,
        userId: intento.job.statement.uploadedById,
        jobAttemptId: intento.id,
        statementId: intento.job.statement.id,
        pageCount: intento.pageCount ?? 0,
        occurredAt: intento.finishedAt ?? intento.startedAt,
        countedStatus: intento.status,
      })),
      skipDuplicates: true,
    });

    process.stdout.write(
      `Intentos elegibles encontrados: ${String(intentos.length)}\n` +
        `Registros de consumo creados: ${String(count)}\n` +
        `(los que ya existían de una corrida anterior se omitieron, no se duplican)\n\n` +
        'No se puede saber cuántos intentos de antes de este fix ya no existen: su ' +
        'documento se borró y se llevó el intento en cascada. Ese consumo ya estaba ' +
        'perdido antes de correr este script; no se intenta reconstruir ni estimar.\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'error desconocido'}\n`);
  process.exitCode = 1;
});
