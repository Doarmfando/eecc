# ADR-0002: PostgreSQL, Prisma y minimización de datos financieros

- Estado: Aceptada
- Fecha: 2026-08-21

## Contexto

El producto necesita relaciones consistentes entre organizaciones, usuarios, documentos, trabajos, intentos, permisos y auditoría. También procesa información bancaria sensible y archivos potencialmente grandes. Redis y almacenamiento de objetos ya tienen responsabilidades separadas dentro de la arquitectura.

## Decisión

Usar PostgreSQL como base relacional y fuente de verdad transaccional, accedida únicamente por NestJS mediante Prisma. Guardar los binarios en almacenamiento S3-compatible y usar Redis solo para ejecución efímera del worker.

Para el MVP, no persistir movimientos bancarios individuales en PostgreSQL. Persistir metadata segura, estados, versiones, métricas, advertencias tipadas y referencias opacas. Los resultados estructurados permanecen cifrados en almacenamiento de objetos durante la retención configurada.

Usar un esquema compartido multi-tenant con `organization_id`, consultas siempre acotadas por tenant y restricciones compuestas. Evaluar RLS antes de producción multi-tenant una vez verificada su integración transaccional con Prisma.

## Alternativas consideradas

- MongoDB como base principal: flexible, pero ofrece menos valor que PostgreSQL para relaciones, restricciones, transacciones e idempotencia del dominio; descartado.
- SQLite en producción: útil para prototipos locales, insuficiente para concurrencia, operación multi-instancia y controles del SaaS; descartado.
- Guardar PDF/XLSX como `bytea`: aumenta tamaño, backups y carga transaccional; descartado.
- Guardar todos los movimientos en PostgreSQL desde el MVP: facilitaría consultas, pero amplía exposición, retención y superficie de cumplimiento sin una necesidad validada; pospuesto.
- Permitir que el worker escriba directamente en PostgreSQL: duplica reglas de autorización y acopla Python al esquema de negocio; descartado.

## Consecuencias

- Prisma y las migraciones viven en `api-backend`.
- NestJS es el único escritor de estado público.
- Los flujos internos requieren callbacks autenticados e idempotentes.
- La interfaz no podrá consultar movimientos individuales desde PostgreSQL en el MVP; deberá descargar/leer un artefacto autorizado o usar una futura vista temporal.
- La operación necesita backups, restauraciones probadas, migraciones compatibles y monitoreo de conexiones/consultas.
- Añadir persistencia de movimientos o cambiar el modelo de aislamiento requiere revisar esta decisión.

## Criterio de revisión

Revisar cuando exista una necesidad comercial comprobada de búsqueda/edición de movimientos, cuando el volumen justifique particionamiento o cuando las pruebas de RLS determinen el modelo final de aislamiento para producción.

