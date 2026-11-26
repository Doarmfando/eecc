-- Catálogo comercial de ATLAS: precio de las membresías y productos de saldo
-- (ADR-0019, etapa 3 de la reestructuración comercial).
--
-- Solo agrega: ninguna persona cambia de plan, de tope ni de saldo con esta
-- migración. `PERSONAL` se crea retirado (`is_active = false`): se ofrece recién
-- cuando el cobro pase a lotes de páginas y se migren Básica y Especial, para que
-- nadie quede con un modelo de cobro a medias.
--
-- Los importes son `DECIMAL(10,2)` en soles, nunca coma flotante. Son el precio
-- publicado: el cobro sigue siendo manual por Yape y lo registra un administrador.
--
-- Idempotente: columnas y tablas nuevas, y semillas con `ON CONFLICT DO NOTHING`
-- para no pisar lo que un superadministrador ya haya editado desde la app.

BEGIN;

-- CreateEnum
CREATE TYPE "CommercialPricing" AS ENUM ('PER_PAGE', 'PACKAGE');

-- AlterTable
ALTER TABLE "membership_plans" ADD COLUMN     "currency" CHAR(3) NOT NULL DEFAULT 'PEN',
ADD COLUMN     "price_amount" DECIMAL(10,2);

ALTER TABLE "membership_plans"
  ADD CONSTRAINT "membership_plans_price_not_negative"
  CHECK ("price_amount" IS NULL OR "price_amount" >= 0);

-- CreateTable
CREATE TABLE "commercial_products" (
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "pricing" "CommercialPricing" NOT NULL,
    "page_quantity" INTEGER,
    "minimum_pages" INTEGER,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'PEN',
    "validity_days" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "commercial_products_pkey" PRIMARY KEY ("code"),
    CONSTRAINT "commercial_products_code_format" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,31}$'),
    CONSTRAINT "commercial_products_price_not_negative" CHECK ("price" >= 0),
    CONSTRAINT "commercial_products_validity_positive" CHECK ("validity_days" > 0),
    -- Cada forma de precio con su dato y sin el de la otra: un paquete sin
    -- cantidad, o una recarga sin mínimo, no se podría cobrar.
    CONSTRAINT "commercial_products_pricing_shape" CHECK (
      ("pricing" = 'PACKAGE' AND "page_quantity" > 0 AND "minimum_pages" IS NULL)
      OR ("pricing" = 'PER_PAGE' AND "minimum_pages" > 0 AND "page_quantity" IS NULL)
    )
);

INSERT INTO "commercial_products"
  ("code", "name", "description", "pricing", "page_quantity", "minimum_pages", "price", "validity_days", "sort_order", "updated_at")
VALUES
  ('RECARGA', 'ATLAS Recargas', 'Páginas adicionales sin cambiar de membresía, desde 20 páginas. Vencen a los 90 días.', 'PER_PAGE', NULL, 20, 0.15, 90, 10, CURRENT_TIMESTAMP),
  ('PROFESIONAL_500', 'ATLAS Profesional 500', '500 páginas para procesar en volumen. Vencen a los 90 días.', 'PACKAGE', 500, NULL, 29.90, 90, 20, CURRENT_TIMESTAMP),
  ('PROFESIONAL_2000', 'ATLAS Profesional 2000', '2,000 páginas para procesar en volumen. Vencen a los 90 días.', 'PACKAGE', 2000, NULL, 59.90, 90, 30, CURRENT_TIMESTAMP),
  ('PROFESIONAL_6000', 'ATLAS Profesional 6000', '6,000 páginas para procesar en volumen. Vencen a los 90 días.', 'PACKAGE', 6000, NULL, 89.90, 90, 40, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- ATLAS Personal: une Básica y Especial. Retirado hasta la migración de cobro.
INSERT INTO "membership_plans"
  ("code", "name", "description", "max_pages_per_document", "monthly_page_quota", "trial_one_time", "is_default", "is_active", "sort_order", "price_amount", "updated_at")
VALUES
  ('PERSONAL', 'ATLAS Personal', 'Historial, Centro Financiero y Calendario, con 50 páginas por periodo mensual.', 1000, 50, false, false, false, 12, 19.90, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "plan_features" ("plan_code", "feature_code") VALUES
  ('PERSONAL', 'HISTORY'),
  ('PERSONAL', 'FINANCIAL_CENTER'),
  ('PERSONAL', 'FINANCIAL_CALENDAR')
ON CONFLICT DO NOTHING;

-- La prueba gratuita tiene precio publicado: cero.
UPDATE "membership_plans" SET "price_amount" = 0, "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'GRATUITO' AND "price_amount" IS NULL;

COMMIT;
