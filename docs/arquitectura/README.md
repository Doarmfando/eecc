# Arquitectura objetivo

## Decisión principal

Se usará un monorepo con tres aplicaciones desplegables. La arquitectura inicial evita compartir una cola entre ecosistemas incompatibles:

```text
React
  │ HTTPS
  ▼
NestJS API ───── PostgreSQL
  │  │
  │  └───────── S3 compatible
  │ HTTP interno autenticado
  ▼
FastAPI ─────── Celery ─────── Redis
                    │
                    ├─ descarga PDF desde S3
                    ├─ detecta, extrae y valida
                    └─ sube resultado y reporta estado
```

NestJS es dueño del estado público del trabajo. FastAPI/Celery es dueño de la ejecución técnica. Redis no es la fuente de verdad del producto.

El modelo de persistencia, la separación PostgreSQL/S3/Redis y las reglas multi-tenant se detallan en [`../_base_de_datos.md`](../_base_de_datos.md).

## Estado implementado del frontend

Existente hoy en `frontend`:

- carga del PDF con validación previa de extensión, tamaño y contenido vacío;
- resumen del trabajo con estado, conteos, advertencias e invariantes evaluadas;
- consulta de un trabajo por identificador con polling que se detiene en estados terminales;
- historial de documentos procesados por la organización, con estado, fecha y conteos;
- validación Zod de toda respuesta y mensajes accionables por código de error;
- descarga de los archivos publicados, acotada a la organización de quien ha entrado;
- inicio de sesión con correo y contraseña, menú de cuenta con cambio de la propia contraseña, y gestión de usuarios para el administrador ([`ADR-0008`](../decisiones/ADR-0008-administrador-y-usuario.md));
- aviso del cupo de documentos antes de subir y en el historial, para que el borrado no sorprenda.

## Estado implementado de la API pública

Existente hoy en `backend/api-backend`:

- `POST /v1/statements` autoriza por sesión o credencial de servicio, valida la carga, llama al worker y persiste trabajo, intento, advertencias, artefactos, auditoría y evento de outbox en una sola transacción.
- `GET /v1/jobs` devuelve el historial de la organización con paginación por cursor.
- `GET /v1/jobs/{jobId}` devuelve el estado del trabajo acotado a la organización de quien lo pide.
- `GET /v1/jobs/{jobId}/artifacts/{artifactId}/content` entrega el archivo: el PDF de origen desde el almacenamiento propio y los resultados desde el worker, que solo sirve lo declarado en su manifiesto.
- La idempotencia usa `Idempotency-Key` o, en su ausencia, una huella HMAC del contenido con alcance por organización más la versión del perfil.
- Los errores públicos son códigos estables y llevan `x-request-id`; nunca trazas ni contenido del documento.

Diferencias intencionales con el objetivo, todavía pendientes:

- la carga llega al servidor y no por URL firmada, y el PDF se guarda en disco tras la interfaz de objetos;
- la descarga pasa por la API en vez de una URL firmada; los resultados se leen del worker;
- el procesamiento es síncrono, por lo que aún no hay `202`, cola pública ni callback firmado.

## Estado implementado del worker

Existente hoy en `backend/pdf-worker`:

- `POST /internal/statements` recibe el PDF por multipart, aplica el límite de tamaño mientras lo lee, ejecuta el pipeline completo y responde `200` con un resumen sin contenido financiero.
- `GET /health` y `GET /internal/extractors` describen el servicio y las estrategias registradas.
- `GET /internal/statements/{job_id}/artifacts/{name}` entrega un archivo publicado usando el manifiesto como lista blanca.
- La tarea Celery `statement_worker.process_statement` ejecuta el mismo trabajo desde la cola interna.
- La idempotencia se deriva del contenido del documento, la estrategia y las opciones; repetir la misma entrada devuelve el trabajo publicado.
- Los artefactos se publican en un directorio por trabajo del sistema de archivos configurado.

Diferencias intencionales con el objetivo, todavía pendientes:

- el endpoint interno procesa de forma síncrona y responde `200`; el `202` con encolado llegará cuando NestJS sea quien crea el trabajo;
- el worker aún no descarga ni sube a S3-compatible, por lo que no existe el callback firmado;
- no hay estado público persistido: `result.json` junto a los artefactos es la única constancia.

## Flujo de procesamiento

1. El frontend solicita una carga y la API valida extensión, tamaño, tipo MIME y permisos.
2. La API crea un registro `statement` y un `job` idempotente, y entrega una URL firmada o recibe la carga en streaming.
3. El archivo se almacena cifrado en un bucket privado.
4. NestJS solicita a FastAPI crear el trabajo interno; FastAPI lo encola en Celery y responde `202`.
5. Celery procesa desde almacenamiento temporal aislado, selecciona una estrategia y genera resultado, métricas y advertencias.
6. El worker sube el artefacto y notifica a NestJS mediante un callback autenticado e idempotente.
7. El frontend consulta el estado con TanStack Query. WebSockets quedan fuera del MVP hasta demostrar necesidad.
8. La descarga usa una URL firmada de corta duración y verifica pertenencia del recurso.

## Estados del trabajo

```text
PENDING → UPLOADED → QUEUED → PROCESSING → SUCCEEDED
                                      ├──→ NEEDS_REVIEW
                                      └──→ FAILED
```

`SUCCEEDED` significa que el pipeline terminó y pasó invariantes definidas. `NEEDS_REVIEW` significa que existe salida utilizable con advertencias. Los estados terminales no deben retroceder. Los reintentos crean intentos auditables y no duplican resultados.

## Contrato público mínimo

- `POST /v1/statements`: registra la carga y devuelve identificadores/URL firmada.
- `POST /v1/statements/{id}/process`: crea o reutiliza un trabajo idempotente; responde `202`.
- `GET /v1/jobs/{id}`: estado, progreso seguro, advertencias resumidas y error sanitizado.
- `GET /v1/statements/{id}/download`: autoriza y entrega una URL firmada del resultado.

El contrato exacto se definirá primero en OpenAPI. Los IDs serán opacos; ningún nombre de objeto deberá incluir cuentas, empresas o periodos sensibles.

El contrato interno del worker ya publica su propio OpenAPI en `/openapi.json` cuando la aplicación está levantada.

## Modelo de extracción

El registro de estrategias contiene únicamente extractores de estados de cuenta bancarios. Un fallback “genérico” puede cubrir layouts de estados de cuenta no especializados, pero nunca convierte PDFs arbitrarios ni omite el umbral de detección.

Cada estrategia implementará conceptualmente:

```text
can_handle(document) -> Detection(score, evidence)
extract(document, context) -> ExtractionResult
validate(result) -> ValidationReport
```

`ExtractionResult` contendrá metadata, movimientos, resumen, control por página, advertencias y versión del extractor. La detección por puntaje debe usar señales del documento, no solo el nombre del archivo.

## Requisitos transversales

- aislamiento por usuario/organización en cada consulta;
- cifrado en tránsito y almacenamiento;
- retención y borrado configurables;
- límites de tamaño, páginas, tiempo y reintentos;
- callbacks internos firmados e idempotentes;
- logs estructurados sin PII financiera;
- trazabilidad por `request_id`, `job_id` y versión del extractor;
- almacenamiento temporal eliminado incluso cuando el proceso falla.

## Evolución

Para el MVP se prioriza claridad operacional. Separar más servicios, añadir WebSockets o adoptar un broker distinto requiere evidencia de carga y un ADR.
