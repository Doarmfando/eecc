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
| Networking | **Sin dominio público.** Solo lo llama la API |

Variables:

```
RAILWAY_DOCKERFILE_PATH=Dockerfile.worker
EECC_WORKER_MAX_CONCURRENT_DOCUMENTS=2
PORT=8000
```

`PORT=8000` es necesario, no decorativo. Railway inyecta un `PORT` propio —8080— también en un servicio sin dominio, y entonces el worker escucha ahí mientras `WORKER_BASE_URL` apunta al 8000: la subida falla con `WORKER_UNAVAILABLE`. Fijarlo mantiene las dos puntas de acuerdo.

### 3. Servicio de la API

**New → GitHub Repo**, el mismo repositorio, llámalo `eecc-api`.

| Ajuste | Valor |
| --- | --- |
| Networking | **Generate Domain**: es el que abrirán las personas |

Variables:

```
RAILWAY_DOCKERFILE_PATH=Dockerfile.api
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
WORKER_BASE_URL=http://eecc-worker.railway.internal:8000
FINGERPRINT_SECRET=<32+ caracteres, propios de esta instalación>
SESSION_TTL_HOURS=12
PROFILE_VERSION=statements-2026.10.21.2
STORAGE_ROOT=/data/storage
```

El Dockerfile de cada servicio se elige con `RAILWAY_DOCKERFILE_PATH`, y no con un `railway.json`: los dos servicios comparten repositorio, así que un archivo en la raíz no puede decir cosas distintas a cada uno. Railway además está retirando esa forma de configuración.

Al desplegar una corrección de extracción, actualizar también `PROFILE_VERSION` en la API si esa variable ya está definida: una variable antigua prevalece sobre el valor por defecto del código. Desplegar primero el worker. El perfil nuevo permite que una nueva subida use las reglas corregidas en lugar de reutilizar el trabajo anterior; no modifica automáticamente los resultados ya publicados y siguen aplicando las reglas de retención.

`PORT` lo inyecta Railway en el servicio público; no la definas ahí. `CORS_ORIGINS` se deja **vacía**: sirviendo la página desde la propia API no hace falta CORS, y abrirlo sin necesidad solo añade superficie.

### 4. Volúmenes

El sistema de archivos de un contenedor es efímero: cada despliegue lo vacía. Sin volumen, los PDF subidos y los resultados **desaparecen en cada actualización**, aunque sus filas sigan en la base de datos.

| Servicio | Punto de montaje | Guarda |
| --- | --- | --- |
| `eecc-api` | `/data` | El PDF de origen (`STORAGE_ROOT=/data/storage`) |
| `eecc-worker` | `/app/artifacts` | Los XLSX/CSV publicados |

### 5. Primera cuenta

Las migraciones se aplican solas al arrancar (`prisma migrate deploy` va en el comando de inicio). La primera persona también, mediante dos variables en `eecc-api`:

```
BOOTSTRAP_ADMIN_EMAIL=tu@empresa.pe
BOOTSTRAP_ADMIN_PASSWORD=<una contraseña larga>
```

Las altas solo admiten correos `@hotmail.com`, `@empresa.pe` y `@eecc.local`; para otra lista, define `ALLOWED_EMAIL_DOMAINS` en `eecc-api` (separada por comas, vacía para no restringir).

Al arrancar, **si y solo si la base no tiene ningún usuario**, se crea la organización y esa persona como administradora. Nunca modifica una instalación en marcha, así que dejar las variables puestas no duplica cuentas; aun así, **retira `BOOTSTRAP_ADMIN_PASSWORD` en cuanto entres y cambies la contraseña**.

Existe porque en Railway la base solo es accesible desde dentro de la red privada: sembrar desde fuera obligaría a exponerla, y `railway ssh` exige registrar una clave SSH. El arranque lo resuelve sin abrir nada.

Si prefieres hacerlo a mano y tienes SSH configurado:

```powershell
railway ssh --service eecc-api
node dist/cli/seed.js
```

`node dist/cli/seed.js` y no `npm run prisma:seed`: ese script usa `ts-node`, que es dependencia de desarrollo y no viaja en la imagen.

A partir de ahí, las demás cuentas se crean desde la propia aplicación, en **Usuarios**.

Al desplegar la migración `20260912120000_administrador_y_usuario`, en cada organización solo queda como administradora la cuenta más antigua de rol más alto (la del arranque); las demás pasan a usuario. Ver [`ADR-0008`](../decisiones/ADR-0008-administrador-y-usuario.md).

Avisos con página (BCP `0.5.2`, `statements-2026.10.21.2`): primero el worker, después la API con `PROFILE_VERSION=statements-2026.10.21.2` en la variable de Railway. No hay migración: la columna `job_warnings.page` ya existía. Un documento convertido antes no gana la página por sí solo; hay que volver a subirlo.

## Comprobar que quedó bien

Para desplegar las mismas hojas en todos los bancos (ADR-0015): primero el
worker (BBVA y BCP `0.5.0`, Banco de la Nación y genérico `0.4.0`, Interbank
`0.3.0`), después la API con `PROFILE_VERSION=statements-2026.10.18` —también
en la variable de Railway si está definida— y por último el frontend. No hay
migración. Comprobar con una carga nueva de cada banco que el libro trae
`Encabezado` y no `Validaciones`, que `Tipo de fila` está en español y que el
historial ofrece el filtro Ahorro/Corriente; con una BBVA, que `Oficina`, `Canal`
y `N.º operación` tienen columna propia.

Para desplegar el formato de Excel de ADR-0012 y ADR-0013 y la elección del
documento a reemplazar (ADR-0014): primero el worker (campo `source_file_name`),
después la API y por último el frontend. Comprobar con una carga nueva que el
`Resumen` empieza por `Archivo` y trae `Saldo inicial`, que `Movimientos` tiene
`Cargo/Abono`, que la descarga se guarda con el nombre del PDF y que, con el cupo
lleno, se pregunta cuál reemplazar.

Para desplegar la conservación del nombre del PDF (ADR-0011), actualizar primero
la API: el arranque aplica `20261017090000_statement_source_file_name` mediante
`prisma migrate deploy`. Después desplegar el frontend en Railway o Vercel.
La migración es aditiva y no reconstruye nombres de documentos antiguos.
Verificar una carga con espacios y acentos, recargar el detalle y buscar el nombre
en el historial. Repetir el mismo PDF debe reutilizarlo y actualizar su etiqueta.

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

**`Permission denied` al escribir en el volumen.** Railway monta los volúmenes como root y los contenedores corren sin privilegios. Las imágenes lo resuelven con un arranque que ajusta el dueño y baja privilegios (`docker/entrypoint-*.sh`); si ves este error, es que ese arranque no se está ejecutando. Comprueba que el script conserva finales de línea LF: con CRLF, el contenedor falla con un desconcertante «no such file or directory» que se refiere al intérprete, no al script.

**El despliegue tarda o falla al construir.** La imagen de la API compila frontend y backend. Si Railway agota memoria, sube el plan del servicio o construye con menos concurrencia.

## El frontend

La imagen de la API sirve también la página, así que el dominio de Railway ya es una aplicación completa y funcional. Si además quieres desplegar el frontend en Vercel, hay una guía propia: [`vercel.md`](vercel.md). Lo importante de ahí: Vercel debe **reenviar** `/v1` a esta API en lugar de que el navegador la llame directamente, o la cookie de sesión no viajará.

## Antes de abrirlo a gente real

Esto queda pendiente y conviene decidirlo:

- **Los documentos se borran al superar el cupo.** Cada persona conserva los de su membresía (Básica 3, Atlas 20) y al superarlo se reemplaza el que elija —por defecto, el más antiguo—. La interfaz lo pregunta antes de subir y avisa después, pero el borrado no se puede deshacer. Ver [`ADR-0007`](../decisiones/ADR-0007-cupo-de-documentos-por-persona.md) y [`ADR-0016`](../decisiones/ADR-0016-roles-y-membresias-como-catalogo.md).
- **Roles y membresías (ADR-0016).** Al desplegar, la migración `roles_y_membresias` pasa los administradores a Atlas y los usuarios a Básica. Los superadministradores se aseguran **al arrancar** con `BOOTSTRAP_SUPER_ADMINS="correo:contraseña,correo:contraseña"` en `eecc-api` (crea los que falten con esa contraseña inicial, promueve los que existan sin tocar la suya y registra solo cuántos); retira la variable en cuanto existan. Es la misma razón que `BOOTSTRAP_ADMIN_*`: `railway ssh` exige que una persona vincule su clave en la web, y la base no se expone. Con SSH configurado también sirve `node dist/cli/super-admins.js <correos>`. Pon el teléfono de soporte en `SUPPORT_PHONE` para que los avisos de error lo muestren.
- **Vigencia (ADR-0017).** La migración `vigencia_de_membresia` deja a las cuentas existentes sin vencimiento; ponles fecha desde *Usuarios*. Los días se cuentan en `BUSINESS_TIMEZONE` (por defecto `America/Lima`), aunque el servicio corra en UTC. Despliega primero el worker (entiende `max_pages`) y después la API; si la API llega antes, el límite de páginas se aplica igual, pero tras procesar.
- **No hay caducidad por tiempo.** Un documento dentro del cupo se conserva indefinidamente si esa persona no sube más.
- **No hay copias de seguridad configuradas** más allá de lo que ofrezca el plugin de PostgreSQL.
- **No hay límite de peticiones** en el inicio de sesión más allá del bloqueo por cinco intentos fallidos, que es por cuenta y no por origen.
