# Tecnologías oficiales

Las versiones exactas se fijarán en los manifiestos y lockfiles cuando se inicialice cada aplicación. No usar rangos abiertos en producción.

## Frontend

- React + Vite + TypeScript estricto.
- Tailwind CSS.
- shadcn/ui con primitivas Radix UI; sus componentes viven en el repositorio.
- Lucide para iconos.
- React Router para navegación.
- TanStack Query para estado remoto, polling y caché.
- React Hook Form + Zod para formularios y validación en el borde.
- Vitest + Testing Library para pruebas de unidad y de componente.
- Playwright para una prueba de extremo a extremo con navegador real. Es la única forma de verificar la pila completa; se activa por variables de entorno y no corre en la suite normal.

No añadir Redux/Zustand para datos que ya administra TanStack Query. El estado local simple permanece en React; una tienda global requiere un caso concreto.

## API pública

- Node.js LTS, NestJS y TypeScript estricto.
- PostgreSQL como fuente de verdad.
- Prisma como ORM y herramienta de migraciones.
- OpenAPI/Swagger para el contrato.
- Almacenamiento S3-compatible; MinIO puede usarse localmente.
- Jest/Supertest para pruebas.

El diseño, propiedad de datos y reglas de PostgreSQL están definidos en [`../_base_de_datos.md`](../_base_de_datos.md). Redis y S3-compatible no reemplazan la base relacional.

## Worker

- Python 3.11 o superior.
- FastAPI + Pydantic Settings para la API interna/configuración; `python-multipart` para la carga de archivos.
- Celery con Redis para ejecución asíncrona interna.
- `pdfplumber` para PDFs con capa de texto.
- `reportlab` solo como dependencia de desarrollo para generar fixtures PDF sintéticos reproducibles.
- `openpyxl` para XLSX.
- `pandas` y `tqdm` solo como dependencias de desarrollo, para ejecutar los scripts legacy dentro de las pruebas de caracterización; el núcleo no los importa.
- `pytest`, Ruff y mypy para calidad.

OCR no forma parte del primer MVP. Si se añade, debe activarse como estrategia separada, con límites de costo y un ADR.

## Infraestructura local

- Docker Compose para PostgreSQL, Redis y MinIO.
- Alternativa sin Docker para equipos donde no puede arrancar (virtualización deshabilitada, sin WSL): `backend/api-backend/scripts/local-postgres.ps1` levanta un PostgreSQL en espacio de usuario. Es solo para desarrollo; el despliegue usa contenedores.
- Variables mediante `.env` local y `.env.example` sin secretos.
- Contenedores separados para API, worker HTTP y procesos Celery.

## Política para nuevas dependencias

Antes de añadir una dependencia, documentar:

1. problema concreto que resuelve;
2. por qué la biblioteca estándar o el stack actual no basta;
3. mantenimiento, licencia y superficie de seguridad;
4. impacto en tamaño, rendimiento y operación;
5. alternativa de retirada.
