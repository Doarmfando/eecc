-- Recarga de páginas puesta por un administrador, y ajuste de Básica/Especial
-- (continuación de ADR-0018).
--
-- El responsable del producto decidió que Atlas deje de ofrecerse como membresía
-- que una persona elige: pasa a ser una "recarga" que un administrador (rango
-- ADMIN, no hace falta SUPER_ADMIN) le pone a alguien que ya tiene Básica o
-- Especial, subiéndole el tope de páginas del mes a un número negociado por
-- fuera (se sigue cotizando y cobrando como hasta ahora, fuera del sistema).
-- Atlas como plan de catálogo se conserva solo para las cuentas de
-- administrador y superadministrador, que ya lo tenían.
--
-- Básica y Especial cambian de números y de vistas: Básica suma Centro
-- Financiero; Especial suma Centro Financiero y Calendario (ya tenía
-- Historial). Las páginas acumuladas de ambas pasan a 15.
--
-- Idempotente: columna con IF NOT EXISTS, catálogo con UPDATE directo e
-- INSERT … ON CONFLICT DO NOTHING para las funciones nuevas.

BEGIN;

ALTER TABLE "organization_memberships"
  ADD COLUMN IF NOT EXISTS "monthly_page_quota_override" INTEGER;

ALTER TABLE "organization_memberships"
  DROP CONSTRAINT IF EXISTS "organization_memberships_quota_override_positive";
ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_quota_override_positive"
  CHECK ("monthly_page_quota_override" IS NULL OR "monthly_page_quota_override" > 0);

UPDATE "membership_plans" SET
  "description" = 'Solo conversión: hasta 3 documentos guardados y 15 páginas acumuladas al mes. Suma Centro Financiero.',
  "monthly_page_quota" = 15,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'BASICA';

UPDATE "membership_plans" SET
  "description" = 'Conversión, Historial, Centro Financiero y Calendario: hasta 10 documentos guardados y 15 páginas acumuladas al mes.',
  "monthly_page_quota" = 15,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'ESPECIAL';

INSERT INTO "plan_features" ("plan_code", "feature_code") VALUES
  ('BASICA', 'FINANCIAL_CENTER'),
  ('ESPECIAL', 'FINANCIAL_CENTER'),
  ('ESPECIAL', 'FINANCIAL_CALENDAR')
ON CONFLICT DO NOTHING;

COMMIT;
