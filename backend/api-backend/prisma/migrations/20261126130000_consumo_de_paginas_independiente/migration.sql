-- Registro de consumo de páginas, independiente del historial documental
-- (corrección de ADR-0018: anexo de integridad del cobro).
--
-- Hoy el acumulado de páginas se calcula contando `job_attempts`, y
-- `jobs`/`job_attempts` se borran en cascada junto con su `statement` (al
-- borrar un documento, al limpiar el cupo de documentos, o al borrar una
-- cuenta). Eso permite recuperar cupo borrando y resubiendo: el bug que
-- corrige esta tabla.
--
-- `job_attempt_id` y `statement_id` son `ON DELETE SET NULL`, nunca cascada:
-- borrar el documento nunca borra lo que ya se cobró por él. `page_count` y
-- `occurred_at` se copian al escribir y no se vuelven a leer del intento.
--
-- CreateTable
CREATE TABLE "page_consumption_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "job_attempt_id" UUID,
    "statement_id" UUID,
    "page_count" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "counted_status" "JobAttemptStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_consumption_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_consumption_entries_organization_id_user_id_occurred_a_idx" ON "page_consumption_entries"("organization_id", "user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "page_consumption_entries_organization_id_job_attempt_id_key" ON "page_consumption_entries"("organization_id", "job_attempt_id");

-- AddForeignKey
ALTER TABLE "page_consumption_entries" ADD CONSTRAINT "page_consumption_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_consumption_entries" ADD CONSTRAINT "page_consumption_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_consumption_entries" ADD CONSTRAINT "page_consumption_entries_job_attempt_id_fkey" FOREIGN KEY ("job_attempt_id") REFERENCES "job_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_consumption_entries" ADD CONSTRAINT "page_consumption_entries_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
