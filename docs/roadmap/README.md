# Roadmap técnico

## Fase 0 — Proteger y medir el legacy

- Inicializar Git sin incorporar archivos financieros.
- Hecho: crear estructura Python reproducible y entorno local del worker.
- Hecho: añadir pruebas sintéticas para fechas, importes, saneamiento y detección BCP.
- Extraer fixtures mínimos anonimizados o sintéticos.
- Hecho: añadir pruebas unitarias sintéticas para layout, columnas, filas y continuaciones BCP.
- Hecho: añadir pruebas unitarias para validación/reconciliación.
- Hecho: congelar el contrato de salida frente al inventario legacy con pruebas de columnas, hojas y diferencias intencionales.
- Hecho: ejecutar el exportador BCP legacy lado a lado sobre un PDF sintético y comparar filas, fechas, importes, totales y control por página.
- Pendiente: caracterizar el exportador general legacy y su conversión CSV con el mismo arnés.
- Hecho: definir el contrato XLSX BCP versionado y probar tipos, límites, estados exportables y protección contra fórmulas.
- Hecho: implementar publicación atómica verificable sin sobrescritura implícita.
- Hecho: añadir pruebas de integración para el escritor físico XLSX y para el paquete CSV.
- Definir invariantes y generar una línea base de rendimiento/memoria.

## Fase 1 — Núcleo del worker

- Hecho: crear modelos iniciales de dominio y errores tipados.
- Hecho: migrar saneamiento PDF como servicio independiente.
- Hecho: implementar detector BCP inicial con evidencia y confianza.
- Hecho: migrar layout, columnas, filas y continuaciones BCP como reglas puras.
- Hecho: crear validación/reconciliación y pipeline visual BCP antes de conectar `pdfplumber`.
- Hecho: conectar la estrategia BCP a `pdfplumber` con un PDF completamente sintético.
- Hecho: separar validación/reconciliación del contrato de exportación XLSX.
- Hecho: conectar el escritor XLSX físico, reabrirlo semánticamente e inspeccionarlo visualmente.
- Hecho: incorporar CSV como adaptador del mismo resultado validado.
- Hecho: mantener comparación ejecutable contra el exportador BCP legacy.
- Hecho: validar la plantilla contra los estados de cuenta reales y corregir detector, agrupación de filas e invariantes con esa evidencia.
- Hecho: respaldo genérico para bancos sin extractor especializado, con selección automática de estrategia.
- Pendiente: extractores especializados por banco a medida que lleguen muestras; el respaldo solo reconcilia cuando el documento trae columna de saldo.

## Fase 2 — Ejecución asíncrona local

- Hecho: inicializar FastAPI, Celery y configuración tipada por entorno.
- Hecho: añadir PostgreSQL, Redis y MinIO mediante Docker Compose, más una alternativa sin Docker para equipos sin virtualización.
- Hecho: implementar límites de tamaño, temporales aislados, idempotencia por contenido, política de reintentos y limpieza.
- Hecho: repartir la lectura de páginas entre procesos (3,4× en 425 páginas, resultado idéntico) y sacar el trabajo bloqueante del bucle de eventos, con tope de documentos simultáneos.
- Pendiente: conectar el almacenamiento S3-compatible y publicar allí los artefactos; hoy la descarga los toma del worker.
- Pendiente: imágenes de contenedor para la API y el worker de cola.

## Fase 3 — API pública

- Hecho: inicializar NestJS con TypeScript estricto, configuración validada y Prisma.
- Hecho: definir el esquema de organización, credenciales, statement, job, intento, advertencias, artefactos, auditoría y outbox.
- Hecho: publicar OpenAPI en `/docs` y el contrato `POST /v1/statements` + `GET /v1/jobs/{id}`.
- Hecho: implementar carga segura, autorización por organización, llamada interna al worker y persistencia transaccional.
- Hecho: primera migración aplicada y pruebas de aislamiento multi-tenant contra PostgreSQL real.
- Hecho: seed reproducible de organización y credencial de servicio para desarrollo local.
- Pendiente: autenticación de usuarios, URLs firmadas y callback firmado cuando el worker procese en modo asíncrono.

## Fase 4 — Frontend MVP

- Hecho: inicializar React, Vite, TypeScript estricto, Tailwind y componentes propios sobre Radix.
- Hecho: carga del documento, progreso, revisión de advertencias e invariantes y estados vacíos.
- Hecho: validar toda respuesta con Zod y traducir los códigos de error a mensajes accionables.
- Hecho: formularios con React Hook Form + Zod y componentes shadcn/ui con tokens propios.
- Hecho: descarga de resultados autorizada por la credencial, con el archivo servido desde el worker.
- Pendiente: login de usuarios; hoy se usa una credencial de servicio que vive solo en memoria.
- Hecho: prueba de extremo a extremo con navegador real sobre la pila completa.
- Hecho: historial de documentos con paginación por cursor en la API y listado en la interfaz.

## Fase 5 — Preparación comercial

- Políticas de retención/borrado, cuotas y auditoría.
- Observabilidad sin PII, backups y recuperación.
- Pruebas de carga, seguridad y aislamiento multi-tenant.
- Facturación y planes solo después de estabilizar exactitud y costos.

## Siguiente tarea recomendada

Procesar de forma asíncrona. La espera del cliente bajó de 42 s a 15 s repartiendo las páginas entre procesos, y el servicio ya no se queda sordo mientras trabaja, pero 15 s siguen siendo una petición HTTP abierta: devolver `202`, encolar en Celery y notificar por callback firmado. Necesita Redis, que hoy no está levantado en esta máquina.

En paralelo, conectar el almacenamiento S3-compatible en los dos servicios: subir allí el PDF de origen y los resultados, sustituir la descarga proxy por URLs firmadas de corta duración y aplicar la política de retención. Hoy los resultados viven en el disco del worker, así que un cambio de su directorio de artefactos deja sin descarga a los trabajos anteriores. MinIO tiene binario nativo para Windows y no necesita Docker.

Después, autenticación de usuarios: hoy solo existe una credencial de servicio en memoria.
