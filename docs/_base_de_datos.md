# Base de datos

## Decisión

El sistema usará una base de datos **relacional OLTP PostgreSQL**, administrada exclusivamente por `backend/api-backend` mediante **Prisma ORM**. PostgreSQL será la fuente de verdad para identidad, pertenencia a organizaciones, estados de documentos y trabajos, auditoría, idempotencia y referencias a artefactos.

La versión mayor de PostgreSQL se fijará al inicializar la infraestructura y será la misma en desarrollo, pruebas y producción. Se elegirá una versión con soporte activo; no se usará la etiqueta de contenedor `latest`.

## Qué tecnología guarda cada cosa

| Tecnología | Responsabilidad | No debe guardar |
| --- | --- | --- |
| PostgreSQL | Usuarios, organizaciones, permisos, documentos, trabajos, intentos, advertencias tipadas, auditoría y claves opacas de objetos | Bytes de PDF/XLSX, payloads de Celery, texto completo extraído |
| S3-compatible | PDF original, XLSX/CSV resultante y manifiesto técnico cifrado | Usuarios, permisos o estado autoritativo del trabajo |
| Redis | Broker/backend temporal de Celery, locks con caducidad y datos efímeros | Estado público permanente, auditoría o sesiones sin TTL |

`pdf-worker` no tendrá credenciales ni conexión directa a PostgreSQL. Recibirá identificadores y claves opacas mediante la API interna y reportará resultados usando un callback autenticado e idempotente. Solo NestJS aplicará cambios a la base de datos.

## Criterio de almacenamiento de datos financieros

El MVP aplica minimización de datos:

- no persiste cada movimiento bancario en PostgreSQL;
- conserva en S3 el resultado estructurado cifrado durante el periodo de retención;
- guarda en PostgreSQL únicamente metadata necesaria: banco detectado, moneda, periodo, conteos, estado de reconciliación, versión del extractor y códigos de advertencia;
- no guarda números de cuenta completos; como máximo, un alias enmascarado y un fingerprint no reversible con alcance por organización;
- no guarda texto crudo del PDF en campos `text` o `jsonb`.

Si el producto necesita búsqueda o edición de movimientos dentro del dashboard, se diseñará un modelo separado, cifrado y con una nueva evaluación de privacidad mediante ADR. No se añadirá una tabla de movimientos “por si acaso”.

## Modelo lógico inicial

El esquema vive en [`../backend/api-backend/prisma/schema.prisma`](../backend/api-backend/prisma/schema.prisma) e implementa este modelo.

Dos adiciones respecto al diseño conceptual, decididas al escribirlo:

- `api_keys` permite autorizar servicios por organización sin inventar un token estático en configuración. Solo se guarda el hash SHA-256; el valor en claro nunca se persiste ni se registra.
- `job_attempts.checks` guarda las invariantes evaluadas por el worker como `jsonb` con `checks_version`. Son códigos y estados, nunca importes ni descripciones, y se validan al leerlos.

### Identidad y multiempresa

| Tabla | Propósito | Campos principales |
| --- | --- | --- |
| `users` | Identidad del usuario | `id`, `email_normalized`, `status`, timestamps |
| `organizations` | Tenant/empresa | `id`, `display_name`, `status`, política de retención, timestamps |
| `organization_memberships` | Relación usuario-organización | `organization_id`, `user_id`, `role`, timestamps |
| `api_keys` | Credencial de servicio con alcance de organización | `organization_id`, `label`, `token_hash`, `status`, `last_used_at` |

### Procesamiento

| Tabla | Propósito | Campos principales |
| --- | --- | --- |
| `statements` | Documento lógico cargado | `id`, `organization_id`, `uploaded_by`, fingerprint, metadata segura, estado de retención, timestamps |
| `jobs` | Solicitud idempotente de procesamiento | `id`, `organization_id`, `statement_id`, `status`, `idempotency_key`, versión del perfil, timestamps |
| `job_attempts` | Cada ejecución/reintento | `id`, `job_id`, número de intento, estado, extractor/versión, error sanitizado, métricas seguras, invariantes en `jsonb` versionado, tiempos |
| `job_warnings` | Advertencias tipadas | `id`, `job_attempt_id`, código, severidad, página opcional, cantidad |
| `artifacts` | Referencias a objetos | `id`, `organization_id`, `statement_id`, `job_attempt_id`, tipo, `object_key`, tamaño, checksum, retención |

### Operación

| Tabla | Propósito | Campos principales |
| --- | --- | --- |
| `audit_events` | Registro append-only de acciones relevantes | organización, actor, acción, entidad, `request_id`, metadata permitida, fecha |
| `outbox_events` | Publicación fiable de eventos posteriores a una transacción | agregado, tipo, payload versionado, fecha/publicación |

## Relaciones y aislamiento

```text
organizations 1 ── N organization_memberships N ── 1 users
organizations 1 ── N statements 1 ── N jobs 1 ── N job_attempts
job_attempts  1 ── N job_warnings
statements/jobs/attempts 1 ── N artifacts
organizations 1 ── N audit_events
```

- Las tablas pertenecientes a un tenant llevan `organization_id`, incluso cuando pueda derivarse por otra relación. Esto facilita filtros, índices y validación contra cruces de tenant.
- Todo repositorio recibe un contexto de organización obligatorio. No se permite un método genérico `findById(id)` para entidades tenant; debe ser equivalente a `findById(organizationId, id)`.
- Las claves foráneas y restricciones compuestas deben impedir asociar un trabajo o artefacto con una organización distinta.
- Antes de producción multi-tenant se evaluará Row-Level Security como defensa adicional. No se declarará aislamiento RLS hasta tener pruebas con el pool de conexiones de Prisma y contexto transaccional seguro.

## Tipos de datos

- Identificadores: `uuid`, generados en la aplicación con un generador criptográficamente seguro.
- Fechas de negocio: `date`.
- Instantes: `timestamptz`, siempre en UTC.
- Moneda: código ISO 4217 de tres caracteres, nunca símbolo visual.
- Importes que deban persistirse: `numeric(20, 2)` o escala definida por moneda; nunca `float`, `double precision` ni el tipo PostgreSQL `money`.
- Contadores: `integer` o `bigint` según límite documentado.
- Estados/roles/tipos estables: enums controlados por migraciones.
- Metadata flexible: `jsonb` solo con esquema versionado y validación previa; no funciona como cajón de sastre.
- Correos y búsquedas normalizadas: almacenar versión normalizada y aplicar unicidad según la política de identidad.

## Estados e invariantes

- `jobs.status` seguirá la máquina definida en `docs/arquitectura/README.md`.
- Los estados terminales no retroceden.
- Un trabajo posee al menos un intento cuando llega a `PROCESSING`.
- `job_attempts` tiene unicidad por `(job_id, attempt_number)`.
- La idempotencia tiene unicidad por `(organization_id, idempotency_key)`.
- `artifacts.object_key` es opaco y único; nunca incorpora nombre de empresa, cuenta o archivo original. Para los resultados del worker la clave incluye la organización, porque el identificador del worker se deriva del contenido y dos tenants con el mismo documento chocarían en la unicidad global.
- Un callback repetido con el mismo identificador de intento no duplica advertencias ni artefactos.
- Las transiciones de estado, artefactos y evento outbox se escriben en una sola transacción cuando formen una unidad lógica.

## Índices iniciales

- `organization_memberships (organization_id, user_id)` único.
- `organization_memberships (user_id, status)` para resolver sesiones.
- `statements (organization_id, created_at desc)`.
- `statements (organization_id, content_fingerprint)`.
- `jobs (organization_id, idempotency_key)` único.
- `jobs (organization_id, status, created_at)` para dashboard y operación.
- `job_attempts (job_id, attempt_number)` único.
- `artifacts (organization_id, statement_id, kind)`.
- `audit_events (organization_id, occurred_at desc)`.
- `outbox_events (published_at, created_at)` con índice parcial para pendientes.

No crear índices sin una consulta conocida. Revisar planes con `EXPLAIN (ANALYZE, BUFFERS)` usando datos sintéticos representativos.

## Fingerprints e idempotencia

El hash directo de un archivo permite correlacionar el mismo documento entre clientes. Para reducir ese riesgo se usará un fingerprint con alcance por tenant, por ejemplo HMAC-SHA-256 sobre `organization_id`, bytes del objeto y versión de perfil. La clave HMAC vive en el gestor de secretos, no en PostgreSQL ni en el repositorio.

El `idempotency_key` externo se valida por longitud/formato y se almacena con organización. No se reutiliza globalmente.

## Migraciones y despliegue

- Prisma Migrate será la única vía normal de cambios de esquema.
- Cada migración se revisa como código y se prueba en una base vacía y en una copia sintética del esquema anterior.
- Producción usa `prisma migrate deploy`; no usa `db push`.
- Cambios destructivos siguen expandir/migrar/contraer: añadir estructura compatible, migrar en segundo plano y retirar después.
- La aplicación y el worker deben tolerar temporalmente la versión anterior/siguiente del contrato durante despliegues.
- Nunca editar una migración ya aplicada; crear una migración correctiva.

## Seguridad, respaldo y retención

- TLS en conexiones y cifrado administrado en disco/backups.
- Credencial exclusiva de la API con mínimo privilegio; migraciones usan una credencial separada.
- Backups automáticos y recuperación point-in-time en producción.
- Restauraciones probadas periódicamente; un backup no probado no cuenta como recuperación.
- Campos sensibles no aparecen en logs de consultas, trazas ni herramientas de observabilidad.
- La eliminación usa un flujo auditable: solicitud, bloqueo, purga de objetos/filas sensibles y evento final sin PII.
- No conservar soft-deletes indefinidos de datos financieros.

## Desarrollo local y pruebas

- PostgreSQL en Docker Compose, con la misma versión mayor que producción.
- Una base separada para pruebas; cada suite limpia solo su esquema asignado.
- Seeds exclusivamente sintéticos.
- Pruebas obligatorias para aislamiento entre organizaciones, restricciones, idempotencia, transición de estados, migraciones y borrado.
- MinIO y Redis se prueban como servicios distintos; no sustituyen garantías de PostgreSQL.

## Decisiones que quedan abiertas

- proveedor administrado de PostgreSQL;
- versión mayor exacta al crear Docker Compose;
- proveedor de autenticación y política de emails;
- adopción de RLS antes de producción;
- periodo comercial de retención por plan;
- persistencia de movimientos si aparece una necesidad validada de búsqueda/edición.

La decisión arquitectónica asociada está registrada en `docs/decisiones/ADR-0002-postgresql-prisma-y-minimizacion-financiera.md`.

