-- Los roles pasan de cuatro (OWNER, ADMIN, MEMBER, VIEWER) a dos: ADMIN y MEMBER.
-- VIEWER no se aplicaba en ningún sitio y OWNER solo se distinguía de ADMIN en la
-- protección del último propietario. Motivos en ADR-0008.
--
-- En cada organización queda como ADMIN una sola cuenta: la de rol más alto y, a
-- igualdad, la activa más antigua. Es la cuenta inicial que crearon el arranque o
-- la semilla. Todas las demás pasan a MEMBER. Así ninguna organización se queda
-- sin quien gestione sus cuentas, y ninguna gana administradores que no eligió.

BEGIN;

WITH administradoras AS (
  SELECT DISTINCT ON ("organization_id") "id"
  FROM "organization_memberships"
  ORDER BY
    "organization_id",
    CASE "role" WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END,
    CASE "status" WHEN 'ACTIVE' THEN 0 ELSE 1 END,
    "created_at",
    "id"
)
UPDATE "organization_memberships"
SET "role" = CASE
  WHEN "id" IN (SELECT "id" FROM administradoras) THEN 'ADMIN'::"MembershipRole"
  ELSE 'MEMBER'::"MembershipRole"
END;

CREATE TYPE "MembershipRole_new" AS ENUM ('ADMIN', 'MEMBER');
ALTER TABLE "organization_memberships" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "organization_memberships"
  ALTER COLUMN "role" TYPE "MembershipRole_new" USING ("role"::text::"MembershipRole_new");
ALTER TYPE "MembershipRole" RENAME TO "MembershipRole_old";
ALTER TYPE "MembershipRole_new" RENAME TO "MembershipRole";
DROP TYPE "MembershipRole_old";
ALTER TABLE "organization_memberships" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

COMMIT;
