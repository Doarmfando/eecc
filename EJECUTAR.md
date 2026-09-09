# Cómo ejecutar el proyecto

Guía completa de puesta en marcha. Si solo quieres empezar, son dos comandos:

```powershell
.\instalar.ps1
.\ejecutar.ps1
```

El segundo te imprime la URL y la credencial para entrar.

## Requisitos

| | Versión | Obligatorio |
| --- | --- | --- |
| Node.js | 20 o superior | Sí |
| Python | 3.11 o superior | Sí |
| Docker | cualquiera | Recomendado para PostgreSQL |

PostgreSQL es obligatorio. Si Docker no puede arrancar en tu equipo, el instalador cae a `backendapi-backend\scripts\local-postgres.ps1`, que descarga los binarios oficiales y crea un cluster local sin permisos de administrador.

Los scripts comprueban Node y Python antes de empezar y te dicen qué falta.

## Instalar

```powershell
.\instalar.ps1
```

Hace todo lo necesario: entorno de Python y sus dependencias, paquetes de la API y del frontend, cliente Prisma, `.env` a partir de los `.env.example`, PostgreSQL levantado, migraciones aplicadas y la primera cuenta de acceso creada.

Al terminar imprime el correo y la contraseña con los que entrar.

**Es idempotente y no pisa tu configuración.** Respeta un `.env` con valores propios y no cambia la contraseña de una persona que ya entra; solo completa lo que falte.

Opciones:

| Comando | Para qué |
| --- | --- |
| `.\instalar.ps1` | Instala y deja todo listo |
| `.\instalar.ps1 -Rehacer` | Borra y recrea el entorno de Python si quedó a medias |

**Detén los servicios antes de instalar.** Con la API en marcha, Windows mantiene bloqueado el motor de Prisma; el script lo detecta y te avisa.

## Ejecutar

```powershell
.\ejecutar.ps1
```

Levanta los tres servicios en segundo plano, espera a que respondan y muestra un resumen con la URL, la credencial y el modo activo.

| Comando | Para qué |
| --- | --- |
| `.\ejecutar.ps1` | Levanta worker, API y frontend |
| `.\ejecutar.ps1 -Estado` | Dice qué está levantado y qué no |
| `.\ejecutar.ps1 -Detener` | Apaga los tres |
| `.\ejecutar.ps1 -SinFrontend` | Solo worker y API |

Si PostgreSQL no responde, el script se detiene y lo dice, en lugar de dejar que la API muera en la primera consulta.

Los registros quedan en `.local\logs\`. Para seguir uno en vivo:

```powershell
Get-Content -Wait -Tail 30 .local\logs\api.log
```

## Usar la aplicación

1. Abre **http://localhost:5173**

   Con `localhost`, **no** con `127.0.0.1`: Vite escucha solo en IPv6, y además la sesión depende de que la página y la API compartan origen.

2. **Entra con tu correo y contraseña.** El instalador imprime los de la primera cuenta; también puedes volver a crearla con `npm run prisma:seed` en `backend\api-backend`.

3. Sube un estado de cuenta en PDF.

4. Revisa las invariantes y advertencias, y descarga el XLSX o los CSV.

## Dar de alta a más personas

Con sesión de `OWNER` o `ADMIN`, entra en **Personas** en el menú lateral:

- **Crear cuenta** genera una contraseña temporal que se muestra **una sola vez**. Entrégasela a la persona; la cambiará al entrar.
- **Rol** decide qué puede hacer: `OWNER` y `ADMIN` gestionan personas, `MEMBER` procesa documentos, `VIEWER` solo consulta.
- **Quitar acceso** cierra sus sesiones abiertas en el acto, no cuando caduque su cookie.
- **Restablecer contraseña** genera otra temporal y cierra también sus sesiones.

No existe registro abierto: nadie entra sin que alguien de la organización lo dé de alta.

## Qué se guarda

**PostgreSQL es obligatorio.** Ahí viven las personas, sus sesiones, el estado de los trabajos y la auditoría.

| | Dónde |
| --- | --- |
| Personas, sesiones y roles | PostgreSQL |
| Estado de los trabajos y auditoría | PostgreSQL |
| PDF que subes | Disco, en `STORAGE_ROOT` (`backend\api-backend\storage`) |
| XLSX/CSV generados | Disco del worker, en su directorio de artefactos |
| Movimientos bancarios | **En ningún sitio**: el esquema no tiene tabla para ellos |

**Los archivos no se acumulan.** Cada persona conserva sus **3 documentos más recientes**; al subir el cuarto, el más antiguo se borra entero: PDF de origen, resultados y fila del historial. El número se ajusta con `RETAINED_STATEMENTS_PER_USER` en el `.env` de la API. Detalles y lo que se pierde a cambio, en [`ADR-0007`](docs/decisiones/ADR-0007-cupo-de-documentos-por-persona.md).

Esa última fila no es un descuido, es la minimización que fija [`ADR-0002`](docs/decisiones/ADR-0002-postgresql-prisma-y-minimizacion-financiera.md): se guardan identificadores, estados, conteos y códigos, nunca los importes ni las descripciones extraídas.

Existió un modo que no guardaba nada; se retiró al añadir el inicio de sesión. El porqué y lo que queda pendiente están en [`ADR-0006`](docs/decisiones/ADR-0006-postgresql-como-unica-persistencia.md).

### Arrancar PostgreSQL a mano

```powershell
docker compose up -d postgres
# Sin Docker:
backend\api-backend\scripts\local-postgres.ps1 -Action start
```

Después, desde `backend\api-backend`:

```powershell
npm run prisma:deploy    # aplica las migraciones
npm run prisma:seed      # crea la organización y la primera persona
```

## Levantarlo a mano

Si prefieres ver los registros en vivo, tres terminales:

```powershell
# 1. Worker de extracción. El puerto DEBE coincidir con WORKER_BASE_URL del .env de la API.
cd backend\pdf-worker
.\.venv\Scripts\python.exe -m uvicorn statement_worker.api.main:app --port 8000

# 2. API pública
cd backend\api-backend
npm run start:dev

# 3. Frontend
cd frontend
npm run dev
```

## Puertos

| Servicio | Puerto | De dónde sale |
| --- | --- | --- |
| Worker | 8000 por defecto | Del `WORKER_BASE_URL` en el `.env` de la API |
| API | 3000 | `PORT` en el `.env` de la API |
| Frontend | 5173 | Por defecto de Vite |

`ejecutar.ps1` deriva el puerto del worker de `WORKER_BASE_URL` en lugar de fijarlo, precisamente para que no puedan desincronizarse.

## Problemas comunes

**`WORKER_UNAVAILABLE` al subir un documento.** El worker no escucha donde la API lo busca. Compara el puerto del worker con `WORKER_BASE_URL` del `.env` de la API — es el fallo más fácil de cometer y el log te da la causa (`TypeError (ECONNREFUSED)`).

**El frontend no carga en `127.0.0.1:5173`.** Usa `http://localhost:5173`. Vite escucha en IPv6.

**`EADDRINUSE: address already in use`.** Quedó una ejecución anterior. Apágala con `.\ejecutar.ps1 -Detener`.

**`Can't reach database server at 127.0.0.1:5432`.** PostgreSQL no está levantado, y la aplicación no funciona sin él. Arráncalo con `docker compose up -d postgres` o con `backend\api-backend\scripts\local-postgres.ps1 -Action start`.

**`INVALID_CREDENTIALS` al entrar.** El correo o la contraseña no son correctos. A propósito no se distingue cuál de los dos: decirlo confirmaría qué correos están dados de alta.

**`ACCOUNT_LOCKED`.** Cinco intentos fallidos seguidos bloquean la cuenta 15 minutos. Un administrador puede restablecer la contraseña desde *Personas* para desbloquearla al momento.

**La sesión se pierde al recargar.** Comprueba que entras por `http://localhost:5173` y no por el puerto de la API: la cookie solo viaja si la página y la API comparten origen, que es lo que resuelve el proxy de Vite.

**`.\instalar.ps1 : No se puede cargar el archivo ... firma digital`.** La directiva de ejecución de PowerShell bloquea scripts. Para esta sesión:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Desplegar

Para Railway hay una guía propia: [`docs/despliegue/railway.md`](docs/despliegue/railway.md). Lo que sigue es el camino genérico.

Compilar y arrancar sin las herramientas de desarrollo:

```powershell
cd backend\api-backend
npm run build          # deja el JavaScript en dist/, sin pruebas
$env:NODE_ENV="production"
npm run start:prod     # node dist/main.js

cd ..\..\frontend
npm run build          # deja los estáticos en dist/
```

El worker se sirve con uvicorn igual que en desarrollo.

Tres cosas que cambian respecto a tu equipo y conviene tener presentes:

- **Hace falta HTTPS.** Con `NODE_ENV=production` la cookie de sesión se marca `Secure`, y un navegador no guarda una cookie `Secure` llegada por HTTP: nadie podría entrar. Es deliberado: son documentos financieros y la sesión no debe viajar en claro.
- **El frontend y la API tienen que compartir dominio.** En desarrollo lo resuelve el proxy de Vite. En despliegue, lo más simple es que la propia API sirva los estáticos: pon `STATIC_ROOT` apuntando al `dist/` del frontend y se encarga ella, incluidas las rutas que solo existen en el navegador. La alternativa es un proxy inverso. Si acaban en dominios distintos, la cookie `SameSite=Lax` no viaja.
- **Cada instalación necesita su `FINGERPRINT_SECRET`.** Forma parte de la clave de idempotencia; no copies el de desarrollo.

Antes de arrancar por primera vez, aplica las migraciones y crea la primera cuenta:

```powershell
cd backend\api-backend
npm run prisma:deploy
npm run prisma:seed
```

## Verificar el código

```powershell
cd backend\api-backend;  npm run check        # tipos, ESLint, Prettier, Prisma y pruebas
cd backend\pdf-worker;   .\scripts\check.ps1  # pytest con cobertura, Ruff y mypy
cd frontend;             npm run lint
```
