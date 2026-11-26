-- Lotes de páginas (ADR-0019, etapas 2b y 4 de la reestructuración comercial).
--
-- Cada fuente de saldo pasa a ser un lote con su cantidad y su vencimiento: la
-- prueba gratuita, el periodo de la membresía y cada compra que registra un
-- administrador. Una reserva reparte su techo entre lotes, primero el que vence
-- antes (FEFO), y al confirmarse fija cuánto se consumió de cada uno.
--
-- Esta migración no crea lotes ni cambia el plan de nadie: el lote del periodo
-- se crea al primer uso, con lo ya consumido en ese periodo leído del registro de
-- consumo (`carried_over_pages`). `period_anchor_at` arranca en la fecha del plan
-- actual (`plan_changed_at`), que es la activación que se conoce.

BEGIN;

-- CreateEnum
CREATE TYPE "PageLotSource" AS ENUM ('TRIAL', 'MEMBERSHIP_PERIOD', 'PURCHASE', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "period_anchor_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "organization_memberships" SET "period_anchor_at" = "plan_changed_at";

-- AlterTable
ALTER TABLE "page_consumption_entries" ADD COLUMN     "reservation_id" UUID;

-- CreateTable
CREATE TABLE "page_lots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "source" "PageLotSource" NOT NULL,
    "plan_code" VARCHAR(32),
    "product_code" VARCHAR(32),
    "period_key" VARCHAR(40),
    "quantity" INTEGER NOT NULL,
    "carried_over_pages" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "price_paid" DECIMAL(10,2),
    "currency" CHAR(3),
    "payment_reference" VARCHAR(100),
    "note" VARCHAR(255),
    "registered_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_lots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "page_lots_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "page_lots_carried_over_range" CHECK ("carried_over_pages" >= 0 AND "carried_over_pages" <= "quantity"),
    CONSTRAINT "page_lots_expiry_after_start" CHECK ("expires_at" IS NULL OR "expires_at" > "starts_at"),
    CONSTRAINT "page_lots_price_not_negative" CHECK ("price_paid" IS NULL OR "price_paid" >= 0),
    -- Cada fuente con sus datos: una compra sin producto ni precio, o un periodo
    -- sin plan ni clave, no se podría auditar.
    CONSTRAINT "page_lots_source_shape" CHECK (
      ("source" = 'TRIAL' AND "plan_code" IS NOT NULL AND "period_key" IS NOT NULL
        AND "product_code" IS NULL AND "price_paid" IS NULL)
      OR ("source" = 'MEMBERSHIP_PERIOD' AND "plan_code" IS NOT NULL AND "period_key" IS NOT NULL
        AND "expires_at" IS NOT NULL AND "product_code" IS NULL AND "price_paid" IS NULL)
      OR ("source" = 'PURCHASE' AND "product_code" IS NOT NULL AND "price_paid" IS NOT NULL
        AND "currency" IS NOT NULL AND "expires_at" IS NOT NULL AND "period_key" IS NULL)
      OR ("source" = 'ADJUSTMENT' AND "note" IS NOT NULL AND "period_key" IS NULL
        AND "product_code" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "page_lot_allocations" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "reserved_pages" INTEGER NOT NULL,
    "consumed_pages" INTEGER,

    CONSTRAINT "page_lot_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "page_lot_allocations_reserved_positive" CHECK ("reserved_pages" > 0),
    CONSTRAINT "page_lot_allocations_consumed_range" CHECK (
      "consumed_pages" IS NULL OR ("consumed_pages" >= 0 AND "consumed_pages" <= "reserved_pages")
    )
);

-- CreateIndex
CREATE INDEX "page_lots_organization_id_user_id_expires_at_idx" ON "page_lots"("organization_id", "user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "page_lots_organization_id_user_id_period_key_key" ON "page_lots"("organization_id", "user_id", "period_key");

-- CreateIndex
CREATE INDEX "page_lot_allocations_lot_id_idx" ON "page_lot_allocations"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "page_lot_allocations_reservation_id_lot_id_key" ON "page_lot_allocations"("reservation_id", "lot_id");

-- AddForeignKey
ALTER TABLE "page_consumption_entries" ADD CONSTRAINT "page_consumption_entries_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "page_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_lots" ADD CONSTRAINT "page_lots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_lots" ADD CONSTRAINT "page_lots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_lots" ADD CONSTRAINT "page_lots_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_lots" ADD CONSTRAINT "page_lots_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "membership_plans"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_lots" ADD CONSTRAINT "page_lots_product_code_fkey" FOREIGN KEY ("product_code") REFERENCES "commercial_products"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_lot_allocations" ADD CONSTRAINT "page_lot_allocations_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "page_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_lot_allocations" ADD CONSTRAINT "page_lot_allocations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "page_lots"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT;
