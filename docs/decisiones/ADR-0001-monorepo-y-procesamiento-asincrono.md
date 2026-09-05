# ADR-0001: Monorepo y procesamiento asíncrono

- Estado: Aceptada
- Fecha: 2026-08-21

## Contexto

El prototipo mezcla extracción, entrada/salida y configuración en scripts locales. Los documentos pueden tener cientos de páginas y no deben bloquear solicitudes web. El producto necesita una interfaz TypeScript, una API de negocio y conservar la lógica especializada de Python.

## Decisión

Mantener un monorepo con React, NestJS y un worker Python. NestJS será la API pública y fuente de verdad del trabajo en PostgreSQL. NestJS invocará una API FastAPI privada; esta encolará ejecución Celery en Redis. Los documentos y resultados vivirán en almacenamiento S3-compatible.

## Alternativas consideradas

- Ejecutar Python desde NestJS: acopla despliegue, límites y fallos; descartado.
- Procesar dentro de una petición HTTP: no sirve para documentos grandes; descartado.
- NestJS/BullMQ y Python/Celery compartiendo Redis: los protocolos de tareas no son equivalentes; descartado.
- Un único backend FastAPI: técnicamente más simple, pero no coincide con la separación y stack de producto elegidos; puede reconsiderarse si el costo operativo supera el valor.

## Consecuencias

- Hay tres aplicaciones y más infraestructura que operar.
- Los contratos internos y callbacks deben ser autenticados, versionados e idempotentes.
- La lógica de extracción puede probarse y escalarse separadamente.
- Redis es infraestructura efímera del worker; PostgreSQL conserva estado auditable.

## Criterio de revisión

Revisar después de medir el MVP. Si la separación NestJS/FastAPI añade más fallos que valor o si aparece una necesidad real de mensajería políglota, evaluar simplificación o un broker neutral mediante un nuevo ADR.

