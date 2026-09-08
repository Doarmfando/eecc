# ADR-0004: Modo sin persistencia seleccionable por configuración

- Estado: Reemplazada por [`ADR-0006`](ADR-0006-postgresql-como-unica-persistencia.md)
- Fecha: 2026-09-03

> El modo sin persistencia se retiró el 2026-09-08. Al introducir identidad de
> personas ([`ADR-0005`](ADR-0005-identidad-de-usuarios-y-sesiones.md)) quedó sin
> inicio de sesión, porque sin base de datos no hay dónde guardar usuarios. El
> razonamiento de abajo se conserva tal cual por si vuelve a hacer falta.

## Contexto

El producto se diseñó alrededor de PostgreSQL y un almacenamiento de objetos: [`ADR-0002`](ADR-0002-postgresql-prisma-y-minimizacion-financiera.md) fijó la minimización financiera —no existe tabla de movimientos— pero el estado de los trabajos, la auditoría y el PDF de origen sí se conservan.

Apareció la necesidad de usar el conversor sin retener nada. La minimización del esquema no basta para eso: aunque la base de datos no guarde movimientos, el PDF de origen se escribe en `STORAGE_ROOT`, los XLSX/CSV quedan en el directorio de artefactos del worker, y los metadatos del trabajo persisten sin ninguna tarea que los caduque (`retentionDays` y `retainUntil` existen en el esquema pero ningún código los usa todavía).

Levantar solo el worker resolvería la retención, pero deja fuera al frontend, que habla el contrato público del api-backend: autorización por credencial, historial y descarga autorizada.

## Decisión

Añadir `PERSISTENCE_MODE` con dos valores. `database` es el modo del producto y no cambia. `memory` sirve el mismo contrato HTTP sin escribir en ningún disco.

Los controladores dejan de depender de clases concretas y pasan a depender de tres puertos declarados en `modules/statements/statements.port.ts` —`StatementProcessor`, `JobReader`, `ArtifactDownloader`—. Cada módulo resuelve su token con una fábrica que consulta el modo. Las implementaciones con base de datos quedan intactas; las de memoria viven en `modules/ephemeral`.

En `memory`:

- el PDF de origen no se escribe, así que tampoco se registra como artefacto descargable;
- los XLSX/CSV se descargan del worker a memoria y después se le pide que borre su copia, mediante `DELETE /internal/statements/{job_id}`, añadido para esto;
- el historial vive en un `Map` del proceso, acotado por `EPHEMERAL_MAX_JOBS` y `EPHEMERAL_TTL_MINUTES`;
- no hay tabla de credenciales: se acepta una sola, `EPHEMERAL_API_KEY`, comparada por hash en tiempo constante, y resuelve siempre a `EPHEMERAL_ORGANIZATION_ID`;
- `DATABASE_URL` y `FINGERPRINT_SECRET` dejan de exigirse; la huella de idempotencia usa un secreto aleatorio por arranque, porque nunca sale del proceso;
- no se escriben eventos de auditoría ni de outbox, porque no hay dónde.

`PrismaService` se construye igual pero no abre conexión. No se sustituye por un doble vacío a propósito: si algún camino intentara consultar la base de datos en este modo, el fallo de conexión lo delata en vez de fingir que la escritura ocurrió.

## Alternativas consideradas

- Levantar solo el `pdf-worker` y hablarle directamente: no retiene nada y no requiere código nuevo, pero deja sin uso el frontend y pierde autorización, historial y descarga autorizada; descartada como solución, útil como diagnóstico.
- Mantener la arquitectura y apuntar `STORAGE_ROOT` y el directorio de artefactos a carpetas temporales, más limpieza periódica de la base: no requiere código, pero «no guardar» pasa a depender de que alguien borre a tiempo, y los metadatos del trabajo siguen escribiéndose; descartada.
- Ramificar dentro de `StatementsService`, `JobsService` y `ArtifactDownloadService` con un `if` por modo: menos archivos nuevos, pero mezcla dos modelos de persistencia en clases que hoy son claras y obliga a que cada método recuerde en qué modo corre; descartada en favor de los puertos.
- Implementar el modo memoria como un `PrismaClient` falso en memoria: reutilizaría los servicios tal cual, pero exigiría emular transacciones, claves compuestas y consultas de Prisma, que es mucho más superficie de la que se quiere sostener; descartada.
- Cifrar en disco en lugar de no escribir: protege el contenido pero no evita la retención, que es lo que se pedía; descartada.

## Consecuencias

- El contrato HTTP es idéntico en ambos modos; el frontend no necesita saber cuál está activo.
- El worker gana una operación destructiva. Es idempotente y valida el identificador con el mismo patrón que la descarga, así que no puede salir del directorio de artefactos.
- Si el descarte en el worker falla, la API lo registra como advertencia y no falla la petición: quien llama ya tiene los bytes y no puede deshacer el trabajo. Queda residuo en el disco del worker y el log lo dice.
- Los bytes de los resultados ocupan RAM mientras el trabajo viva. `EPHEMERAL_MAX_JOBS` no es un ajuste de rendimiento sino el límite que impide que un proceso largo acumule estados de cuenta enteros en memoria.
- Reiniciar el proceso borra el historial. Es la propiedad buscada, no un defecto, pero implica que este modo no sirve para un despliegue donde alguien espere recuperar un trabajo de ayer.
- Con una sola credencial y una sola organización, el aislamiento multi-tenant sigue implementado y probado en el almacén, pero no hay forma de crear un segundo tenant sin base de datos.
- La decisión no toca `ADR-0002`: el modo `database` sigue siendo el del producto y el esquema no cambia.

## Criterio de revisión

Revisar si el modo sin persistencia deja de ser una conveniencia local y pasa a desplegarse, momento en el que harían falta credenciales múltiples y un almacén compartido entre réplicas. Revisar también cuando se implemente la caducidad real de `retentionDays`/`retainUntil` en el modo con base de datos, porque parte de la motivación de este modo desaparecería.
