-- Permiso para administrar el catálogo de membresías (ADR-0018, anexo).
--
-- El responsable del producto pidió que los planes (Gratuito, Básico, Especial,
-- Atlas) se administren desde la base, sin que cada ajuste de precio o de
-- páginas sea una migración de código: ya era un catálogo (ADR-0016), lo que
-- faltaba era un permiso y una ruta para escribirlo desde la aplicación. Se
-- reserva a SUPER_ADMIN y no a ADMIN: cambia el negocio para todas las
-- organizaciones, no una cuenta a la vez como `USERS_MANAGE`.
--
-- Idempotente: ON CONFLICT DO NOTHING en los tres INSERT.

BEGIN;

INSERT INTO "permissions" ("code", "description") VALUES
  ('PLANS_MANAGE', 'Crear o modificar el catálogo de membresías: precio, páginas y vistas.')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_code", "permission_code") VALUES
  ('SUPER_ADMIN', 'PLANS_MANAGE')
ON CONFLICT DO NOTHING;

COMMIT;
