-- Vigencia de la membresía (ADR-0017).
--
-- Cada persona puede tener un último día de vigencia; vencida, no convierte hasta
-- que un administrador la renueve. Solo lo llevan los roles que lo exigen: hoy los
-- usuarios (`MEMBER`). Administradores y superadministradores no vencen.
--
-- Las cuentas que ya existían quedan sin vencimiento (nulo): no se inventa una
-- fecha. La gestión de usuarios las muestra como «sin vencimiento» para fijarla.
--
-- Idempotente: una transacción, columnas con `IF NOT EXISTS` y una actualización
-- que deja el mismo resultado si se repite.

BEGIN;

ALTER TABLE "organization_memberships" ADD COLUMN IF NOT EXISTS "plan_expires_on" DATE;

ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "plan_expiry_required" BOOLEAN NOT NULL DEFAULT false;

UPDATE "roles" SET "plan_expiry_required" = ("code" = 'MEMBER') WHERE "code" IN ('MEMBER', 'ADMIN', 'SUPER_ADMIN');

COMMIT;
