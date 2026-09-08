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
| Docker | cualquiera | Solo para el modo con base de datos |

Los scripts comprueban Node y Python antes de empezar y te dicen qué falta.

## Instalar

```powershell
.\instalar.ps1
```

Hace cuatro cosas: crea el entorno virtual de Python e instala sus dependencias, instala los paquetes de la API y del frontend, genera el cliente Prisma, y prepara los `.env` a partir de los `.env.example`.

**Es idempotente y no pisa tu configuración.** Si ya tienes un `.env` con valores propios, los respeta y solo añade las claves que falten. La credencial de servicio se genera una única vez y se reutiliza en las siguientes ejecuciones.

Opciones:

| Comando | Para qué |
| --- | --- |
| `.\instalar.ps1` | Instala y deja el modo sin persistencia |
| `.\instalar.ps1 -Modo base-de-datos` | Instala y deja el modo con PostgreSQL |
| `.\instalar.ps1 -Rehacer` | Borra y recrea el entorno de Python si quedó a medias |

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
| `.\ejecutar.ps1 -Modo memoria` | Fuerza el modo sin guardar, sin tocar el `.env` |
| `.\ejecutar.ps1 -SinFrontend` | Solo worker y API |

Los registros quedan en `.local\logs\`. Para seguir uno en vivo:

```powershell
Get-Content -Wait -Tail 30 .local\logs\api.log
```

## Usar la aplicación

1. Abre **http://localhost:5173**

   Con `localhost`, **no** con `127.0.0.1`: Vite escucha solo en IPv6, y además la sesión depende de que la página y la API compartan origen.

2. **Entra con tu correo y contraseña.** El instalador imprime los de la primera cuenta; también puedes regenerarla con `npm run prisma:seed` en `backend\api-backend`.

   En modo `memory` no hay usuarios: se entra con la credencial de servicio (`EPHEMERAL_API_KEY`).

3. Sube un estado de cuenta en PDF.

4. Revisa las invariantes y advertencias, y descarga el XLSX o los CSV.

## Dar de alta a más personas

Con sesión de `OWNER` o `ADMIN`, entra en **Personas** en el menú lateral:

- **Crear cuenta** genera una contraseña temporal que se muestra **una sola vez**. Entrégasela a la persona; la cambiará al entrar.
- **Rol** decide qué puede hacer: `OWNER` y `ADMIN` gestionan personas, `MEMBER` procesa documentos, `VIEWER` solo consulta.
- **Quitar acceso** cierra sus sesiones abiertas en el acto, no cuando caduque su cookie.
- **Restablecer contraseña** genera otra temporal y cierra también sus sesiones.

No existe registro abierto: nadie entra sin que alguien de la organización lo dé de alta.

## Los dos modos de persistencia

Se elige con `PERSISTENCE_MODE` en `backend\api-backend\.env`. El contrato HTTP es idéntico en ambos: el frontend no distingue cuál está activo.

| | `memory` | `database` |
| --- | --- | --- |
| PDF que subes | No se guarda nunca | Se escribe en `storage/` |
| XLSX/CSV generados | A memoria; se ordena al worker borrar su copia | Quedan en `artifacts/` del worker |
| Estado de los trabajos | En memoria del proceso | Filas en PostgreSQL |
| Auditoría | No existe | Filas en PostgreSQL |
| PostgreSQL | Ni se conecta | Obligatorio |
| Historial al reiniciar | Se pierde | Se conserva |
| Credenciales | Una sola, `EPHEMERAL_API_KEY` | Usuario y contraseña por persona |
| Inicio de sesión | No hay: sin base de datos no hay usuarios | Sí, con roles y auditoría |

En ambos modos **hay que autenticarse**: sin sesión ni credencial la API responde `AUTHENTICATION_REQUIRED`.

El modo `memory` está pensado para trabajar con documentos reales sin retener información financiera. Sus límites están detallados en [`docs/decisiones/ADR-0004-modo-sin-persistencia.md`](docs/decisiones/ADR-0004-modo-sin-persistencia.md).

### Pasar al modo con base de datos

Lo más simple es dejar que el instalador lo prepare todo:

```powershell
.\ejecutar.ps1 -Detener
.\instalar.ps1 -Modo base-de-datos
```

Levanta PostgreSQL, aplica las migraciones, crea la primera cuenta e imprime sus datos de acceso.

A mano sería:

```powershell
docker compose up -d postgres    # o: backend\api-backend\scripts\local-postgres.ps1 -Action start
cd backend\api-backend
npm run prisma:deploy
npm run prisma:seed              # crea la organización y la primera persona, UNA sola vez
```

## Comprobar que no guarda nada

Con el modo `memory`, tras procesar un documento estas dos carpetas deben quedar **vacías**:

```powershell
dir backend\pdf-worker\artifacts     # donde el worker publica los XLSX/CSV
dir backend\api-backend\storage      # donde iría el PDF de origen
```

Y al reiniciar la API el historial desaparece.

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

**`Can't reach database server at 127.0.0.1:5432`.** Estás en modo `database` sin PostgreSQL. Levanta `docker compose up -d postgres` o cambia a `PERSISTENCE_MODE=memory`.

**`INVALID_CREDENTIALS` al entrar.** El correo o la contraseña no son correctos. A propósito no se distingue cuál de los dos: decirlo confirmaría qué correos están dados de alta.

**`ACCOUNT_LOCKED`.** Cinco intentos fallidos seguidos bloquean la cuenta 15 minutos. Un administrador puede restablecer la contraseña desde *Personas* para desbloquearla al momento.

**La sesión se pierde al recargar.** Comprueba que entras por `http://localhost:5173` y no por el puerto de la API: la cookie solo viaja si la página y la API comparten origen, que es lo que resuelve el proxy de Vite.

**`API_KEY_INVALID`.** Estás en modo `memory` y la credencial no coincide con `EPHEMERAL_API_KEY` del `.env`. Cópiala de ahí.

**`.\instalar.ps1 : No se puede cargar el archivo ... firma digital`.** La directiva de ejecución de PowerShell bloquea scripts. Para esta sesión:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Verificar el código

```powershell
cd backend\api-backend;  npm run check        # tipos, ESLint, Prettier, Prisma y pruebas
cd backend\pdf-worker;   .\scripts\check.ps1  # pytest con cobertura, Ruff y mypy
cd frontend;             npm run lint
```
