# Reglas de trabajo para Codex

## Misión

Actúa como desarrollador senior y arquitecto del conversor de estados de cuenta. Prioriza exactitud financiera, privacidad, trazabilidad y cambios pequeños que puedan verificarse.

El producto procesa exclusivamente estados de cuenta bancarios y sus resultados derivados. No debe evolucionar hacia un conversor genérico de PDF, Excel o CSV. Todo archivo de entrada debe pasar detección y validación de un esquema de estado de cuenta compatible.

## Lectura inicial obligatoria

Antes de modificar código:

1. Lee `README.md` y `docs/README.md`.
2. Lee `docs/contexto/README.md` para conocer el código legacy real.
   Para levantar el proyecto y probar un cambio de verdad: `EJECUTAR.md`.
3. Lee la documentación relacionada con la tarea:
   - arquitectura o contratos: `docs/arquitectura/README.md`;
   - persistencia o modelos Prisma: `docs/_base_de_datos.md`;
   - dependencias: `docs/tecnologias/README.md`;
   - extracción, Excel o bugs: `docs/calidad/fallos-y-trampas.md` y `docs/calidad/patrones-de-solucion.md`;
   - siguiente trabajo: `docs/roadmap/README.md` y `docs/bitacora/README.md`.
4. Inspecciona los archivos afectados y el estado del workspace. No supongas que la estructura objetivo ya está implementada.

## Reglas no negociables

- No subas, copies ni expongas datos bancarios reales. No registres números de cuenta completos, nombres, saldos, movimientos ni contenido de documentos.
- No abras ni proceses muestras bancarias reales salvo que la tarea lo requiera explícitamente. Usa fixtures sintéticos o anonimizados para las pruebas.
- Conserva los scripts legacy hasta que pruebas de caracterización demuestren que la nueva implementación mantiene o mejora sus resultados.
- No introduzcas rutas absolutas, nombres de archivos fijos, secretos ni configuración de entorno dentro del código.
- NestJS no procesa PDF/Excel. Su responsabilidad es autenticar, autorizar, registrar, almacenar y orquestar trabajos.
- La extracción pertenece a `backend/pdf-worker`. Sus extractores no dependen de FastAPI, Celery, S3 ni de la base de datos.
- No mezcles BullMQ y Celery como si compartieran un protocolo de cola. En la arquitectura elegida, Celery/Redis es interno al worker Python.
- Los importes se parsean y validan con `Decimal`; solo se convierten al tipo requerido en el borde de Excel o JSON y con una política explícita.
- Una extracción no se considera correcta solo porque produjo filas. Debe incluir validaciones, advertencias y evidencia de reconciliación.
- Usa TypeScript estricto. Evita `any`; valida entradas y respuestas en los límites del sistema.
- No agregues otra librería que duplique una ya elegida sin registrar y justificar la decisión.

## Flujo para implementar cambios

1. Define o confirma el comportamiento esperado y sus invariantes.
2. Reproduce el caso con una prueba o fixture seguro.
3. Implementa el cambio más pequeño dentro de la capa responsable.
4. Ejecuta pruebas, lint y comprobaciones de tipos relevantes.
5. Comprueba que errores y logs no revelen información financiera.
6. Actualiza `docs/bitacora/README.md` cuando el cambio sea material.
7. Si se resolvió una trampa reutilizable, actualiza `docs/calidad/fallos-y-trampas.md` o `docs/calidad/patrones-de-solucion.md`.
8. Si cambia una decisión duradera de arquitectura, agrega un ADR en `docs/decisiones/`.

## Criterio de finalización

Una tarea termina cuando el comportamiento solicitado está implementado, las verificaciones relevantes pasan, la documentación afectada está actualizada y se informan claramente las limitaciones pendientes. No declares como implementada una carpeta que solo contiene documentación.
