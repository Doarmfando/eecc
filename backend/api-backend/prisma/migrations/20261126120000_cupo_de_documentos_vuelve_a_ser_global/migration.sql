-- El cupo de documentos guardados vuelve a ser un único número global para
-- cualquier persona, sin importar su membresía (ADR-0007), revirtiendo el
-- cambio de ADR-0016 que lo había vuelto una columna por plan.
--
-- El modelo de negocio es solo por páginas (ADR-0018): el catálogo de planes
-- ya no necesita, ni debe, configurar también cuántos documentos guarda cada
-- uno. `RETAINED_STATEMENTS_PER_USER` (variable de entorno, 3 por defecto) ya
-- existía como cupo de las credenciales de servicio; ahora es el cupo de
-- cualquiera.
--
-- Idempotente: `DROP CONSTRAINT IF EXISTS` y `DROP COLUMN IF EXISTS`.

BEGIN;

ALTER TABLE "membership_plans"
  DROP CONSTRAINT IF EXISTS "membership_plans_retained_range";

ALTER TABLE "membership_plans"
  DROP COLUMN IF EXISTS "max_retained_statements";

COMMIT;
