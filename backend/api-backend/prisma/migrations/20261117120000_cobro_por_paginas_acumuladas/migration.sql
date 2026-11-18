-- Cobro por páginas acumuladas al mes, prueba gratuita única y tope técnico de
-- seguridad por PDF (ADR-0018).
--
-- Hasta ahora `max_pages_per_document` cumplía dos papeles a la vez: proteger al
-- worker de un archivo absurdo (seguridad) y fijar cuánto se cobra (negocio).
-- Un PDF de páginas sin límite real (Atlas tenía `max_pages_per_document` nulo)
-- podía colgar el worker varias horas. Esta migración separa los dos papeles:
--
--   * `max_pages_per_document` pasa a ser solo el tope técnico: alto (1000) e
--     igual para todos los planes. Protege al worker, no decide el cobro.
--   * `monthly_page_quota` es el nuevo límite de cobro: páginas acumuladas que
--     la persona puede procesar sumando TODOS sus PDF en una ventana móvil de
--     30 días (se calcula en el código al subir, sin tarea programada, igual
--     que el cupo de documentos de ADR-0007). Nulo: sin tope fijo, se cotiza
--     (hoy solo Atlas).
--   * `trial_one_time` marca un plan cuya prueba no se renueva cada mes, a
--     diferencia de `monthly_page_quota`: se consume una vez por persona
--     (`organization_memberships.trial_used_at`) y no vuelve a concederse.
--
-- Se agregan los planes Gratuito (prueba única) y Especial. Básica y Atlas
-- conservan nombre, cupo de documentos y vigencia; solo cambian sus páginas.
--
-- Idempotente: columnas con IF NOT EXISTS, catálogo con ON CONFLICT DO UPDATE.

BEGIN;

ALTER TABLE "membership_plans" ADD COLUMN IF NOT EXISTS "monthly_page_quota" INTEGER;
ALTER TABLE "membership_plans" ADD COLUMN IF NOT EXISTS "trial_one_time" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "membership_plans" DROP CONSTRAINT IF EXISTS "membership_plans_monthly_quota_positive";
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_monthly_quota_positive"
  CHECK ("monthly_page_quota" IS NULL OR "monthly_page_quota" > 0);

ALTER TABLE "organization_memberships" ADD COLUMN IF NOT EXISTS "trial_used_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "statements_organization_id_uploaded_by_idx"
  ON "statements" ("organization_id", "uploaded_by");
CREATE INDEX IF NOT EXISTS "job_attempts_organization_id_started_at_idx"
  ON "job_attempts" ("organization_id", "started_at");

-- Básica: el tope por PDF pasa a ser solo de seguridad; el cobro real es el
-- acumulado mensual.
UPDATE "membership_plans" SET
  "description" = 'Solo conversión: hasta 3 documentos guardados y 10 páginas acumuladas al mes.',
  "max_pages_per_document" = 1000,
  "monthly_page_quota" = 10,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'BASICA';

-- Atlas: cierra el agujero de páginas sin ningún tope (riesgo real: un PDF de
-- cientos de miles de páginas podía ocupar el worker varias horas). Sigue sin
-- cobro fijo por páginas: se cotiza según volumen real.
UPDATE "membership_plans" SET
  "description" = 'Todo el producto: historial, Centro Financiero y Calendario, hasta 20 documentos guardados. Volumen de páginas a cotizar.',
  "max_pages_per_document" = 1000,
  "monthly_page_quota" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'ATLAS';

INSERT INTO "membership_plans"
  ("code", "name", "description", "max_retained_statements", "max_pages_per_document", "monthly_page_quota", "trial_one_time", "is_default", "is_active", "sort_order", "updated_at")
VALUES
  ('GRATUITO', 'Gratuito', 'Una conversión de prueba, hasta 3 páginas. No se renueva.', 1, 1000, 3, true, false, true, 5, CURRENT_TIMESTAMP),
  ('ESPECIAL', 'Especial', 'Conversión e historial: hasta 10 documentos guardados y 20 páginas acumuladas al mes.', 10, 1000, 20, false, false, true, 15, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "max_retained_statements" = EXCLUDED."max_retained_statements",
  "max_pages_per_document" = EXCLUDED."max_pages_per_document",
  "monthly_page_quota" = EXCLUDED."monthly_page_quota",
  "trial_one_time" = EXCLUDED."trial_one_time",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;

-- Especial suma Historial: necesita ver sus propias conversiones para seguir su
-- acumulado mensual, igual que Atlas. No incluye Centro Financiero ni
-- Calendario: quedan como diferenciador exclusivo de Atlas.
INSERT INTO "plan_features" ("plan_code", "feature_code") VALUES ('ESPECIAL', 'HISTORY')
ON CONFLICT DO NOTHING;

COMMIT;
