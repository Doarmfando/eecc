-- Reserva de páginas antes de llamar al worker (ADR-0018, anexo de concurrencia).
--
-- El chequeo del acumulado era una lectura sin lock, antes de la llamada al worker
-- y antes de la transacción que registra el consumo: dos subidas simultáneas de la
-- misma persona leían el mismo acumulado y ambas pasaban aunque juntas excedieran
-- el tope. Ahora cada subida aparta su techo de páginas bajo un lock de aviso por
-- persona, y las reservas pendientes cuentan como usadas hasta que se resuelven.
--
-- No cambia cómo se cobra (sigue siendo la ventana móvil de 30 días): solo cierra
-- la carrera. Sin datos que migrar.
--
-- CreateEnum
CREATE TYPE "PageReservationStatus" AS ENUM ('PENDING', 'COMMITTED', 'RELEASED');

-- CreateTable
CREATE TABLE "page_reservations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "pages" INTEGER NOT NULL,
    "status" "PageReservationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ(6),

    CONSTRAINT "page_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "page_reservations_pages_positive" CHECK ("pages" > 0)
);

-- CreateIndex
CREATE INDEX "page_reservations_organization_id_user_id_status_created_at_idx" ON "page_reservations"("organization_id", "user_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "page_reservations" ADD CONSTRAINT "page_reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_reservations" ADD CONSTRAINT "page_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
