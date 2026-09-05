# Backend

El backend se divide por responsabilidad, no por lenguaje:

- `api-backend`: superficie pública NestJS. Es dueño de usuarios, autorización, trabajos, auditoría y contratos HTTP públicos.
- `pdf-worker`: servicio Python privado. Es dueño de la detección del formato, extracción, normalización, validación y construcción de archivos.

La comunicación inicial será HTTP interna y autenticada. El worker administra sus tareas Celery mediante Redis; NestJS no consume directamente esa cola.

