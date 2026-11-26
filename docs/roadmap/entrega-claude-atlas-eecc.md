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
| `359af1f` | Simulación y corte manual a Personal para cuentas compatibles. |
| `a477f1a` | Cobros manuales y cancelación de renovación de Personal. |
| `cafc3f8` | Panel comercial y exportación CSV. |

El migrador vive en `backend/api-backend/src/cli/migrate-personal.ts` y
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
2. Implementar el aviso de lotes por vencer a partir del saldo vigente en *Mi saldo*. Usar
   fechas de Lima, incluir solo lotes con páginas disponibles y probar el límite de vigencia.
3. Completar la matriz de 28 escenarios del prompt con pruebas sintéticas y registrar qué
   escenarios requieren una base PostgreSQL local con migraciones aplicadas.

El modelo comercial vive en [ADR-0019](../decisiones/ADR-0019-modelo-comercial-de-cuatro-productos.md).
La evidencia de consumo anterior a su registro puede ser irrecuperable. Los fixtures deben seguir
siendo sintéticos y la bitácora debe recibir cada cambio material.

## Cobro manual de Personal

La migración `20261126165000_personal_payments` y el servicio `PersonalService` incorporan pagos
confirmados por Yape. Se registran desde el detalle de la cuenta y la persona puede cancelar la
renovación desde *Mi saldo* sin perder la vigencia pagada. La prueba
`test/personal-payments.e2e-spec.ts` usa un esquema sintético `test_personal_payments_*` con
`RUN_PERSONAL_PAYMENT_TESTS=1`. El precio publicado del catálogo por sí solo no es un ingreso.

## Panel comercial

La página `/comercial` y `GET /v1/commercial-report` ya están en la rama. Verifica el contrato
en `report.dto.ts` y las fuentes en `report.queries.ts`. El CSV usa el mismo resultado y el
panel muestra estimaciones cuando se configura un costo variable por página.
La prueba `test/commercial-report.e2e-spec.ts` usa `RUN_COMMERCIAL_REPORT_TESTS=1` y un esquema
sintético `test_commercial_report_*` con las migraciones aplicadas.

## Acceso al vencer Personal

`AuthService.resolveSession` actualiza el acceso en cada solicitud. `GET /v1/jobs` exige
`HISTORY` por defecto y verifica la función solicitada cuando alimenta el Centro Financiero o
el Calendario. El reemplazo manual y el borrado masivo también exigen Historial. La carga
puede usar páginas compradas al vencer. El detalle, la descarga y el borrado individual
conservan la autorización por propietario. El reemplazo automático informa un conteo a las
sesiones sin Historial. Hay pruebas de API en `test/auth.e2e-spec.ts` y de interfaz en
`src/pages/plan-membership.test.tsx`. Pasaron 385 pruebas de API y 426 de frontend con
`npm run check`. También pasaron las siete pruebas de `test/page-lots.e2e-spec.ts` en
PostgreSQL local, incluida la conversión con saldo comprado al vencer la membresía.
