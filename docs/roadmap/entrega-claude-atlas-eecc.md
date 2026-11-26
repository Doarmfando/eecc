# Continuación para Claude — ATLAS EECC

Retoma `feature/lotes-de-paginas`. Lee primero `AGENTS.md`, el [plan de trabajo](tareas-en-curso.md)
y el [informe de migración](migracion-a-personal.md). El objetivo sigue siendo el prompt maestro de
reestructuración comercial. Railway `production` se verificó en `36291ad` de `main` antes de este
trabajo. El despliegue comercial requiere autorización explícita. El archivo local `dasdasd` estaba
fuera de Git antes de iniciar y pertenece al workspace del usuario.

## Cambios disponibles en Git

| Commit | Alcance |
| --- | --- |
| `8630e26` | Registro de consumo independiente del historial documental. |
| `6d0dd69` | Reservas transaccionales de páginas para subidas concurrentes. |
| `5defbeb` | Catálogo y cotizaciones para Personal, Recargas y Profesional. |
| `269163e` | Lotes, consumo FEFO y alta administrativa de compras pagadas por Yape. |
| `afd818a` | Interfaz de saldo y registro de compras. |
| `5bce51b` | Historial comercial propio y primer informe de impacto. |

El commit que incorpora esta entrega añade `backend/api-backend/src/cli/migrate-personal.ts` y
`personal-migration.ts`. La simulación devuelve conteos de candidatas y excepciones. El corte
manual activa Personal, establece Gratuito como plan por defecto, separa el plan interno de
administración y migra las membresías compatibles. Preserva el periodo, el vencimiento, el
consumo registrado, las compras y los documentos. Aborta el corte completo ante una reserva
pendiente de una cuenta que pasaría a Personal.

## Verificación local

Desde `backend/api-backend`, apunta `DATABASE_URL` a un esquema PostgreSQL local, vacío e
independiente llamado `test_personal_*`. Luego ejecuta:

```powershell
npm run prisma:deploy
npm run commercial:migrate-personal
$env:RUN_PERSONAL_MIGRATION_TESTS = '1'
npm run check
```

La prueba `test/personal-migration.e2e-spec.ts` añade cuentas sintéticas al catálogo sembrado,
simula el corte, comprueba el rollback por reserva pendiente, aplica dos veces y verifica el
saldo, la auditoría y las excepciones. El comando de producción compilado entra en modo
simulación sin argumentos. `--apply` queda reservado para la ventana autorizada.

## Siguiente trabajo

1. Cerrar las excepciones de la migración. El inventario de Railway encontró un acuerdo Básica
   superior a la cuota de Personal y dos Atlas con otros roles. Confirmar la regla de renovación
   y el reparto de páginas antes de escribir ajustes. La herramienta actual conserva esos casos
   íntegros y el reporte requiere revisarse al cortar.
2. Implementar registro de cobros confirmados y cancelación de renovación para Personal. La
   vigencia actual se administra manualmente. El precio publicado del catálogo no constituye un
   ingreso. La renovación automática depende de una pasarela operativa.
3. Implementar el panel comercial del §12 con los datos verificables. `page_lots` da compras de
   Recargas y Profesional, `page_consumption_entries` da consumo y `page_lot_allocations` atribuye
   el uso. Contabilizar los intentos fallidos con la evidencia disponible y declarar las fuentes
   de costos antes de mostrar márgenes. Mantener aislamiento por organización y exportes sin datos
   bancarios.
4. Revisar las restricciones de Personal vencido y las acciones de historial. En este punto
   `tieneFuncion` usa el catálogo sin consultar `expired` y `GET /v1/jobs` filtra por dueño sin
   verificar la función de historial. Preservar la consulta y descarga del trabajo propio que
   permite Gratuito. Completar los avisos de vencimiento de lotes y la matriz de 28 pruebas del prompt.

El modelo comercial vive en [ADR-0019](../decisiones/ADR-0019-modelo-comercial-de-cuatro-productos.md).
La evidencia de consumo anterior a su registro puede ser irrecuperable. Los fixtures deben seguir
siendo sintéticos y la bitácora debe recibir cada cambio material.
