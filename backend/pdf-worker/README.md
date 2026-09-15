# PDF worker

Núcleo Python dedicado exclusivamente al procesamiento de estados de cuenta bancarios. No es un conversor genérico de PDF/XLSX/CSV. Ya existen contratos de dominio, parsing de fechas/importes, saneamiento seguro, detección BCP y un adaptador `pdfplumber` conectado al pipeline reconciliado. Las exportaciones XLSX y CSV escriben, verifican y publican sus archivos desde el mismo plan validado, y una API interna FastAPI más una tarea Celery ejecutan el trabajo completo de forma idempotente. El almacenamiento S3-compatible se incorporará después de proteger su límite con pruebas.

## Estado

| Componente | Estado |
| --- | --- |
| Modelos y errores de dominio | Implementado |
| Parsing de fechas e importes | Implementado |
| Saneamiento PDF | Implementado |
| Detector de plantilla BCP | Implementado |
| Layout, columnas y filas BCP | Implementado con datos sintéticos |
| Validación y reconciliación BCP | Implementado |
| Pipeline visual BCP puro | Implementado |
| Adaptador `pdfplumber` para BCP | Implementado con PDF sintético |
| Contrato y preparación XLSX BCP | Implementado |
| Publicación atómica de artefactos | Implementado |
| Escritor físico XLSX y reapertura semántica | Implementado |
| Inspección visual de las hojas XLSX | Hecha sobre el estado de cuenta sintético |
| Exportación CSV por paquete | Implementado |
| Caracterización contra el exportador BCP legacy | Implementada con PDF sintético |
| Configuración tipada por entorno | Implementada |
| Registro de estrategias por banco | Implementado |
| Estrategia BCP especializada | Implementada y validada con documentos reales |
| Estrategia Interbank especializada (`interbank-savings-v1`) | Implementada y validada con un documento real: reconcilia saldo fila a fila, totales y saldo final |
| Estrategia Banco de la Nación (`banco-nacion-v1`) | Implementada con PDF sintético; **sin validar todavía con un documento real** (ver [`docs/architecture.md`](docs/architecture.md#extractor-banco-de-la-nación)) |
| Respaldo genérico para otros bancos | Implementado; nombra las columnas por su encabezado o las deduce de la aritmética |
| Servicio de trabajo idempotente | Implementado |
| API interna FastAPI | Implementada |
| Tarea Celery interna | Implementada; el broker corre en Docker Compose |
| Entrega de artefactos publicados | Implementada; el manifiesto es la lista blanca |
| Almacenamiento S3-compatible | Pendiente |

## Estructura

```text
src/statement_worker/
├── api/             # Adaptador HTTP interno (FastAPI)
├── domain/          # Modelos, contratos y errores sin infraestructura
├── exporters/       # Contratos de salida, escritor XLSX y paquete CSV
├── extractors/      # Detectores y estrategias por banco/versión
├── parsing/         # Normalización pura de fechas, importes y texto
├── services/        # Pipeline, saneamiento, trabajo y publicación
├── tasks/           # Adaptador Celery
└── config.py        # Configuración tipada leída del entorno
tests/
├── unit/            # Pruebas rápidas y deterministas
├── integration/     # Pruebas de adaptadores con artefactos sintéticos
├── characterization/# Comparación contra los scripts legacy reales
└── support/         # Generadores de datos y documentos ficticios
typings/             # Stubs locales para dependencias transitivas opacas
docs/                # Guías específicas del servicio
```

## Requisitos

- Python 3.11 o superior.
- El núcleo puro usa únicamente la biblioteca estándar.
- La lectura de PDF con capa de texto instala el extra `pdf` (`pdfplumber`).
- La escritura de XLSX instala el extra `excel` (`openpyxl`).
- Las pruebas de caracterización ejecutan el script legacy real, que necesita `pandas` y `tqdm` del extra `dev`.

## Preparar el entorno

Desde `backend/pdf-worker` en PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[pdf,excel,api,queue,dev]"
Copy-Item .env.example .env
```

Los extras `pdf` y `excel` bastan para el núcleo y sus exportadores. `api` y `queue` solo hacen falta para levantar la API o el worker de cola.

## Verificar

```powershell
.\scripts\check.ps1
```

El script ejecuta pytest con cobertura mínima de 90%, Ruff lint/formato y mypy. Como alternativa sin instalar herramientas de desarrollo, las pruebas también son compatibles con `unittest` usando `PYTHONPATH=src`.

## Ejecutar

La configuración se lee del entorno con el prefijo `EECC_WORKER_`; ver [`.env.example`](.env.example).

```powershell
# API interna
.\.venv\Scripts\python.exe -m uvicorn statement_worker.api.main:app --port 8000

# Worker de cola (requiere Redis; `docker compose up -d redis` en la raíz)
.\.venv\Scripts\python.exe -m celery -A statement_worker.tasks.celery_app worker -Q statements -l info
```

`POST /internal/statements` recibe el PDF y devuelve un resumen sin contenido financiero: identificador del trabajo, estado, conteos, códigos de invariantes y artefactos publicados con su checksum. Repetir el mismo documento con las mismas opciones devuelve el trabajo anterior en lugar de rehacerlo.

`GET /internal/statements/{job_id}/artifacts/{name}` entrega un archivo ya publicado. El manifiesto del trabajo es la lista blanca: un nombre que no figure allí no se sirve, y eso también impide salir del directorio del trabajo.

`DELETE /internal/statements/{job_id}` borra todo lo que el trabajo publicó: artefactos y manifiesto. Es para quien ya se llevó los bytes y no quiere que quede copia aquí, y lo usa el api-backend en su modo sin persistencia. Es idempotente: descartar un trabajo inexistente responde igual que descartar uno real.

## Lectura obligatoria

Antes de modificar este servicio, leer [`AGENTS.md`](AGENTS.md) y [`docs/README.md`](docs/README.md). La migración desde los scripts raíz se controla en [`docs/migration.md`](docs/migration.md).
