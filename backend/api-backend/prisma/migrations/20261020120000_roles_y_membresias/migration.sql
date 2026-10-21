-- Roles y membresías como catálogos (ADR-0016).
--
-- El rol pasa de enum a tabla con permisos y rango: añadir un rol es insertar
-- filas, no recrear un tipo. El rango ordena quién gestiona a quién: MEMBER (10),
-- ADMIN (50) y SUPER_ADMIN (100), que administra incluso a los administradores.
--
-- Nace la membresía (plan) de cada persona, con sus límites y las vistas que
-- habilita: BASICA (solo conversión, 3 documentos, 15 páginas por PDF) y ATLAS
-- (todo el producto, 20 documentos, sin límite de páginas).
--
-- Cuentas existentes: los administradores pasan a ATLAS y los usuarios a BASICA,
-- que es la membresía por defecto. Un administrador puede cambiarla después.
--
-- Idempotencia: todo va en una transacción, así que un fallo no deja la base a
-- medias y la migración se puede reintentar. Las filas del catálogo se insertan
-- con `ON CONFLICT DO NOTHING`: una fila sembrada a mano antes no la duplica ni la
-- pisa. Las migraciones que cambien un plan después usarán
-- `ON CONFLICT ("code") DO UPDATE`, no un `UPDATE` que no hace nada si falta.

BEGIN;

CREATE TABLE "roles" (
  "code" VARCHAR(32) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "description" VARCHAR(255) NOT NULL,
  "rank" INTEGER NOT NULL DEFAULT 0,
  "default_plan_code" VARCHAR(32),
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("code"),
  CONSTRAINT "roles_code_format" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  CONSTRAINT "roles_rank_range" CHECK ("rank" BETWEEN 0 AND 1000)
);

CREATE TABLE "permissions" (
  "code" VARCHAR(64) NOT NULL,
  "description" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("code"),
  CONSTRAINT "permissions_code_format" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,63}$')
);

CREATE TABLE "role_permissions" (
  "role_code" VARCHAR(32) NOT NULL,
  "permission_code" VARCHAR(64) NOT NULL,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_code", "permission_code")
);

CREATE TABLE "membership_plans" (
  "code" VARCHAR(32) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "description" VARCHAR(255) NOT NULL,
  "max_retained_statements" INTEGER NOT NULL,
  "max_pages_per_document" INTEGER,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("code"),
  CONSTRAINT "membership_plans_code_format" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  -- Al menos uno: con cero, cada subida borraría el documento anterior al instante.
  CONSTRAINT "membership_plans_retained_range" CHECK ("max_retained_statements" BETWEEN 1 AND 1000),
  CONSTRAINT "membership_plans_pages_positive" CHECK ("max_pages_per_document" IS NULL OR "max_pages_per_document" > 0)
);

CREATE TABLE "features" (
  "code" VARCHAR(64) NOT NULL,
  "description" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "features_pkey" PRIMARY KEY ("code"),
  CONSTRAINT "features_code_format" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,63}$')
);

CREATE TABLE "plan_features" (
  "plan_code" VARCHAR(32) NOT NULL,
  "feature_code" VARCHAR(64) NOT NULL,
  CONSTRAINT "plan_features_pkey" PRIMARY KEY ("plan_code", "feature_code")
);

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_default_plan_code_fkey" FOREIGN KEY ("default_plan_code")
    REFERENCES "membership_plans"("code") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "role_permissions"
  ADD CONSTRAINT "role_permissions_role_code_fkey" FOREIGN KEY ("role_code")
    REFERENCES "roles"("code") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "role_permissions_permission_code_fkey" FOREIGN KEY ("permission_code")
    REFERENCES "permissions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_features"
  ADD CONSTRAINT "plan_features_plan_code_fkey" FOREIGN KEY ("plan_code")
    REFERENCES "membership_plans"("code") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "plan_features_feature_code_fkey" FOREIGN KEY ("feature_code")
    REFERENCES "features"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- Catálogo inicial. Los códigos son el contrato con el código de la API y del
-- frontend; nombres y descripciones son texto para la interfaz.

-- Los planes van antes que los roles: un rol puede proponer uno al dar de alta.
INSERT INTO "membership_plans"
  ("code", "name", "description", "max_retained_statements", "max_pages_per_document", "is_default", "sort_order", "updated_at")
VALUES
  ('BASICA', 'Básica', 'Solo conversión: hasta 3 documentos guardados y 15 páginas por PDF.', 3, 15, true, 10, CURRENT_TIMESTAMP),
  ('ATLAS', 'Atlas', 'Todo el producto: historial, Centro Financiero y Calendario, hasta 20 documentos guardados y sin límite de páginas.', 20, NULL, false, 20, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

INSERT INTO "roles" ("code", "name", "description", "rank", "default_plan_code", "is_system") VALUES
  ('SUPER_ADMIN', 'Superadministrador', 'Administra toda la organización, incluidos los administradores. Solo otra persona de rango superior podría eliminarlo o degradarlo.', 100, 'ATLAS', true),
  ('ADMIN', 'Administrador', 'Usa todo el producto y gestiona las cuentas de usuario y sus membresías. Otro administrador no lo puede eliminar ni degradar.', 50, 'ATLAS', true),
  ('MEMBER', 'Usuario', 'Convierte estados de cuenta con las vistas y límites de su membresía.', 10, NULL, true)
ON CONFLICT DO NOTHING;

INSERT INTO "permissions" ("code", "description") VALUES
  ('STATEMENTS_CONVERT', 'Subir estados de cuenta y descargar sus conversiones'),
  ('USERS_MANAGE', 'Crear, editar, desactivar y eliminar cuentas, y asignar su membresía')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_code", "permission_code") VALUES
  ('SUPER_ADMIN', 'STATEMENTS_CONVERT'),
  ('SUPER_ADMIN', 'USERS_MANAGE'),
  ('ADMIN', 'STATEMENTS_CONVERT'),
  ('ADMIN', 'USERS_MANAGE'),
  ('MEMBER', 'STATEMENTS_CONVERT')
ON CONFLICT DO NOTHING;

INSERT INTO "features" ("code", "description") VALUES
  ('HISTORY', 'Historial de documentos con buscador y filtros'),
  ('FINANCIAL_CENTER', 'Centro Financiero: cuentas consolidadas y movimientos'),
  ('FINANCIAL_CALENDAR', 'Calendario financiero día a día')
ON CONFLICT DO NOTHING;

INSERT INTO "plan_features" ("plan_code", "feature_code") VALUES
  ('ATLAS', 'HISTORY'),
  ('ATLAS', 'FINANCIAL_CENTER'),
  ('ATLAS', 'FINANCIAL_CALENDAR')
ON CONFLICT DO NOTHING;

-- De enum a catálogo, sin perder el rol de nadie.

ALTER TABLE "organization_memberships"
  ADD COLUMN "role_code" VARCHAR(32),
  ADD COLUMN "plan_code" VARCHAR(32),
  ADD COLUMN "plan_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "organization_memberships"
SET
  "role_code" = "role"::text,
  "plan_code" = CASE WHEN "role" = 'ADMIN' THEN 'ATLAS' ELSE 'BASICA' END;

ALTER TABLE "organization_memberships"
  ALTER COLUMN "role_code" SET NOT NULL,
  ALTER COLUMN "plan_code" SET NOT NULL,
  DROP COLUMN "role";

DROP TYPE "MembershipRole";

ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_role_code_fkey" FOREIGN KEY ("role_code")
    REFERENCES "roles"("code") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "organization_memberships_plan_code_fkey" FOREIGN KEY ("plan_code")
    REFERENCES "membership_plans"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "organization_memberships_plan_code_idx" ON "organization_memberships"("plan_code");

COMMIT;
