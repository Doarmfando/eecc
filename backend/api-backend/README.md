# API backend

Aplicación NestJS que expone el contrato público del conversor de estados de cuenta. Es dueña de la autorización, la persistencia del estado de los trabajos y la auditoría. No importa librerías de PDF/Excel ni ejecuta extracción: delega en la API interna de [`../pdf-worker`](../pdf-worker/README.md).

## Estado

| Componente | Estado |
| --- | --- |
| Configuración tipada y validada al arrancar | Implementada |
| Esquema Prisma y primera migración | Aplicados contra PostgreSQL real |
| Aislamiento multi-tenant | Verificado con pruebas contra base real |
| Autorización por credencial de servicio con alcance de organización | Implementada |
| Inicio de sesión de personas con cookie httpOnly y roles | Implementado |
| Gestión de personas por administrador (alta, rol, revocación, restablecer clave) | Implementada |
| Carga segura y validación del documento | Implementada |
| Llamada a la API interna del worker | Implementada y probada contra el worker real |
| Persistencia transaccional de trabajo, intento, advertencias, artefactos, auditoría y outbox | Implementada |
| Consulta de trabajos acotada por organización | Implementada |
| Historial paginado por cursor | Implementado |
| OpenAPI/Swagger | Publicado en `/docs` |
| Descarga autorizada de artefactos | Implementada |
| Modo sin persistencia (`PERSISTENCE_MODE=memory`) | Implementado; ni base de datos ni disco |
| Almacenamiento S3-compatible | Pendiente; hoy escribe en disco tras la misma interfaz |
| Autenticación de usuarios y URLs firmadas | Pendiente |
| Callback firmado desde el worker | Pendiente; la llamada interna es síncrona |

## Estructura

```text
src/
├── common/
│   ├── http/          # Request id, contexto de organización y filtro de errores
│   ├── prisma/        # Único acceso a PostgreSQL
│   └── security/      # Guard de credencial de servicio
├── config/            # Configuración validada del entorno
├── modules/
│   ├── auth/          # Contraseñas, sesiones y rutas de inicio de sesión
│   ├── ephemeral/     # Implementaciones en memoria del modo sin persistencia
│   ├── users/         # Gestión de personas de la organización
│   ├── health/
│   ├── jobs/
│   ├── statements/
│   ├── storage/       # Adaptador de objetos (disco hoy, S3 después)
│   └── worker-client/ # Único punto que habla con el worker
├── app.module.ts
└── main.ts
prisma/schema.prisma   # Modelo lógico de `docs/_base_de_datos.md`
test/                  # e2e con dobles y contrato en vivo opcional
```

## Preparar el entorno

```powershell
npm install
Copy-Item .env.example .env

# Base de datos con Docker (ruta oficial), desde la raiz del repositorio
docker compose up -d postgres

# Alternativa sin Docker, si no puede arrancar en tu equipo
.\scripts\local-postgres.ps1 -Action start

npm run prisma:migrate
npm run prisma:seed
```

`prisma:seed` crea una organización de desarrollo y muestra una credencial de servicio una sola vez: guárdala, solo se almacena su hash.

`.env` no se versiona. `FINGERPRINT_SECRET` debe tener al menos 32 caracteres y, en despliegue, vivir en el gestor de secretos.

## Ejecutar

```powershell
# Requiere PostgreSQL: `docker compose up -d postgres` en la raíz del repositorio.
npm run start:dev
```

El worker debe estar levantado en `WORKER_BASE_URL`. La documentación OpenAPI queda en `/docs`.

## Ejecutar sin guardar nada

`PERSISTENCE_MODE=memory` arranca la API sin PostgreSQL y sin escribir en disco. Es el modo para usar el conversor cuando no se quiere retener información financiera.

```powershell
Copy-Item .env.example .env   # si aún no existe
# En `.env`:
#   PERSISTENCE_MODE=memory
#   EPHEMERAL_API_KEY=<32-128 caracteres de [A-Za-z0-9._-]>
npm run start:dev
```

No hacen falta `docker compose up`, `prisma:migrate` ni `prisma:seed`: `DATABASE_URL` y `FINGERPRINT_SECRET` dejan de exigirse. La credencial que espera el frontend es `EPHEMERAL_API_KEY`, la única que se acepta.

Qué cambia respecto al modo con base de datos:

- el PDF de origen no se guarda en ninguna parte y, por tanto, no aparece entre los artefactos descargables;
- los XLSX/CSV se traen del worker a memoria y después se le pide que borre su copia, de modo que su directorio de artefactos tampoco los conserva;
- el historial vive en el proceso y se pierde al reiniciar; además caduca a los `EPHEMERAL_TTL_MINUTES` y solo guarda los `EPHEMERAL_MAX_JOBS` más recientes;
- no hay auditoría ni eventos de outbox, porque no hay dónde escribirlos.

El contrato HTTP es idéntico en ambos modos: el frontend no distingue cuál está activo.

Límites conocidos:

- una sola credencial y una sola organización, sin `prisma:seed` que las cree;
- los resultados ocupan RAM mientras duran, que es lo que acota `EPHEMERAL_MAX_JOBS`;
- si el worker no puede borrar su copia, la API lo registra como advertencia y sigue: conviene revisar su directorio de artefactos.

## Verificar

```powershell
npm run check
```

Ejecuta comprobación de tipos, ESLint, Prettier, validación del esquema Prisma y las pruebas con cobertura mínima.

Para comprobar el contrato real contra el worker levantado:

```powershell
$env:WORKER_LIVE_URL="http://127.0.0.1:8000"
$env:WORKER_LIVE_PDF="ruta\a\un\pdf\sintetico.pdf"
npm test -- test/worker-contract
```

Sin esas variables esa suite se salta y el resto de pruebas corre sin servicios externos.

Para el aislamiento multi-tenant contra PostgreSQL real:

```powershell
$env:RUN_DB_TESTS="1"
npm test -- test/tenant-isolation
```

Esa suite crea sus propias organizaciones con prefijo reconocible y las borra al terminar.

## Contrato actual

- `POST /v1/auth/login`: correo y contraseña; deja la cookie de sesión y devuelve la persona, su organización y su rol.
- `POST /v1/auth/logout`: revoca la sesión y borra la cookie.
- `GET /v1/auth/me`: datos de la sesión activa.
- `POST /v1/auth/password`: cambia la contraseña propia y cierra las demás sesiones.
- `GET /v1/users`, `POST /v1/users`, `PATCH /v1/users/{userId}`, `POST /v1/users/{userId}/password-reset`: gestión de personas, solo para `OWNER` y `ADMIN` con sesión. Una credencial de servicio no las alcanza.
- `GET /health`: comprobación de vida, sin prefijo de versión.
- `POST /v1/statements`: recibe el PDF por multipart, procesa y devuelve el resumen del trabajo. Acepta `Idempotency-Key`; sin ella, la clave se deriva del contenido y la versión del perfil.
- `GET /v1/jobs`: historial de la organización, del más reciente al más antiguo, con paginación por cursor (`limit`, `cursor`). El cursor es opaco y combina fecha e identificador, de modo que insertar trabajos nuevos no repite ni salta filas.
- `GET /v1/jobs/{jobId}`: estado del trabajo, siempre acotado a la organización de la credencial.
- `GET /v1/jobs/{jobId}/artifacts/{artifactId}/content`: descarga el artefacto si pertenece a ese trabajo y a esa organización. El PDF de origen sale del almacenamiento propio; los resultados se piden al worker, que solo sirve lo que su manifiesto declara. En `PERSISTENCE_MODE=memory` no hay PDF de origen y los resultados salen de memoria.

Las respuestas contienen identificadores, estados, conteos y códigos. Nunca incluyen movimientos, importes, claves de objeto, rutas locales ni trazas.

## Reglas propias

- Toda consulta de una entidad de tenant recibe la organización; no existe `findById(id)` a secas.
- De una contraseña solo se guarda su derivación `scrypt`, y nunca aparece en un registro ni en una respuesta.
- La sesión es un token opaco con fila propia, no un JWT: revocar el acceso surte efecto en la petición siguiente. Ver [`ADR-0005`](../../docs/decisiones/ADR-0005-identidad-de-usuarios-y-sesiones.md).
- El estado del trabajo, sus artefactos, la auditoría y el evento de outbox se escriben en una sola transacción.
- Los controladores dependen de los puertos de `modules/statements/statements.port.ts`, no de una implementación: `PERSISTENCE_MODE` decide cuál se inyecta.
- Los errores públicos son códigos estables; el detalle interno solo va al log del servidor.
- El esquema Prisma implementa [`../../docs/_base_de_datos.md`](../../docs/_base_de_datos.md). El worker no recibe credenciales de PostgreSQL ni escribe tablas directamente.
