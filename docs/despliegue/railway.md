# Desplegar en Railway

Tres piezas: una base de datos, un servicio interno de extracción y un servicio público que sirve la API **y** el frontend.

```
                    ┌─────────────────────────────┐
   Internet  ──────►│  eecc-api  (público, HTTPS) │
                    │  · sirve la página en  /    │
                    │  · sirve la API en  /v1     │
                    └──────┬───────────────┬──────┘
                           │ red privada   │
                    ┌──────▼──────┐  ┌─────▼──────┐
                    │ eecc-worker │  │ PostgreSQL │
                    │  (privado)  │  │  (plugin)  │
                    └─────────────┘  └────────────┘
```

## Por qué la API sirve también el frontend

No es una comodidad, es un requisito. La sesión viaja en una cookie `SameSite=Lax`, que el navegador **solo envía si la página y la API comparten origen**. En Railway cada servicio recibe su propio dominio `*.up.railway.app`, así que separarlos dejaría a todo el mundo fuera con un síntoma desconcertante: el login responde `200` y la sesión no persiste.

La imagen `Dockerfile.api` compila el frontend y lo copia junto a la API. `STATIC_ROOT` le dice dónde está, y el servidor entrega la página en cualquier ruta que no sea `/v1`, `/health`, `/docs` ni un archivo.

## Pasos

### 1. Base de datos

En el proyecto de Railway: **New → Database → PostgreSQL**. Railway crea la variable `DATABASE_URL`.

### 2. Servicio del worker

**New → GitHub Repo**, elige este repositorio y llámalo `eecc-worker`.

| Ajuste | Valor |
| --- | --- |
| Config-as-code path | `railway.worker.json` |
| Networking | **Sin dominio público.** Solo lo llama la API |

Variables:

```
EECC_WORKER_MAX_CONCURRENT_DOCUMENTS=2
```

### 3. Servicio de la API

**New → GitHub Repo**, el mismo repositorio, llámalo `eecc-api`.

| Ajuste | Valor |
| --- | --- |
| Config-as-code path | `railway.json` |
| Networking | **Generate Domain**: es el que abrirán las personas |

Variables:

```
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
WORKER_BASE_URL=http://eecc-worker.railway.internal:8000
FINGERPRINT_SECRET=<32+ caracteres, propios de esta instalación>
SESSION_TTL_HOURS=12
PROFILE_VERSION=bcp-2026.08
STORAGE_ROOT=/data/storage
```

`PORT` lo inyecta Railway; no la definas. `CORS_ORIGINS` se deja **vacía**: con un solo origen no hace falta CORS, y abrirlo sin necesidad solo añade superficie.

### 4. Volúmenes

El sistema de archivos de un contenedor es efímero: cada despliegue lo vacía. Sin volumen, los PDF subidos y los resultados **desaparecen en cada actualización**, aunque sus filas sigan en la base de datos.

| Servicio | Punto de montaje | Guarda |
| --- | --- | --- |
| `eecc-api` | `/data` | El PDF de origen (`STORAGE_ROOT=/data/storage`) |
| `eecc-worker` | `/app/artifacts` | Los XLSX/CSV publicados |

### 5. Primera cuenta

Las migraciones se aplican solas al arrancar (`prisma migrate deploy` va en el comando de inicio). La primera persona no: hay que crearla una vez.

Se ejecuta **dentro del contenedor**, con la [CLI de Railway](https://docs.railway.com/guides/cli):

```powershell
railway link                     # elige el proyecto
railway ssh --service eecc-api
# ya dentro:
SEED_ADMIN_EMAIL=tu@empresa.pe SEED_ADMIN_PASSWORD=<clave larga> node dist/cli/seed.js
```

`node dist/cli/seed.js` y no `npm run prisma:seed`: ese script usa `ts-node`, que es dependencia de desarrollo y no viaja en la imagen. Por eso la semilla vive en `src/cli/` y se compila con el resto.

Sin las dos variables genera una contraseña y la imprime **una sola vez**. A partir de ahí, las demás cuentas se crean desde la propia aplicación, en **Personas**.

## Comprobar que quedó bien

```powershell
curl https://<tu-dominio>.up.railway.app/health
# {"status":"ok"}
```

Después, en el navegador:

1. Abre el dominio: debe cargar la página de inicio de sesión.
2. Entra. **Recarga con F5 estando dentro**: si sigues dentro, la cookie funciona. Si te devuelve al login, la página y la API no comparten origen.
3. Sube un estado de cuenta y descarga el XLSX.

## Problemas conocidos

**Entro y me devuelve al login.** La cookie no se está guardando. Las dos causas habituales: el dominio no es HTTPS (con `NODE_ENV=production` la cookie se marca `Secure` y un navegador la descarta si llega por HTTP), o el frontend se está sirviendo desde un dominio distinto al de la API.

**`WORKER_UNAVAILABLE` al subir.** La API no alcanza al worker. Comprueba que `WORKER_BASE_URL` usa el nombre interno exacto del servicio. La familia de red ya está resuelta: el worker arranca con `statement_worker.api.serve`, que abre un socket de doble pila. Un `uvicorn --host ::` a secas escucharía solo en IPv6 y un `--host 0.0.0.0` solo en IPv4; ninguno de los dos vale para todos los entornos.

**Los resultados desaparecen tras un despliegue.** Falta el volumen del paso 4.

**El despliegue tarda o falla al construir.** La imagen de la API compila frontend y backend. Si Railway agota memoria, sube el plan del servicio o construye con menos concurrencia.

## Antes de abrirlo a gente real

Esto queda pendiente y conviene decidirlo:

- **La retención no está implementada.** `Organization.retentionDays`, `Statement.retainUntil` y `Artifact.retainUntil` existen en el esquema y ningún código los aplica: hoy nada caduca solo y los documentos se acumulan. Ver [`ADR-0006`](../decisiones/ADR-0006-postgresql-como-unica-persistencia.md).
- **No hay copias de seguridad configuradas** más allá de lo que ofrezca el plugin de PostgreSQL.
- **No hay límite de peticiones** en el inicio de sesión más allá del bloqueo por cinco intentos fallidos, que es por cuenta y no por origen.
