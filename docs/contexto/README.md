# Contexto y lectura del código actual

## Problema que resuelve

El sistema transforma exclusivamente estados de cuenta bancarios PDF en filas estructuradas y archivos Excel/CSV. No es ni será un conversor genérico de documentos. El producto futuro permitirá a empresas y contadores cargar estados de cuenta compatibles, seguir el procesamiento, revisar advertencias y descargar resultados.

## Inventario auditado el 2026-08-21

Los cuatro scripts y los documentos de muestra viven en [`referencias/`](../../referencias); la raíz solo contiene el producto nuevo.

### `convertir_movimientos_pdf_a_excel (1).py`

Es el prototipo más avanzado (1,167 líneas). Incluye:

- limpieza temporal de bytes anteriores a `%PDF-` y posteriores al último `%%EOF`;
- lectura BCP por coordenadas fijas;
- fallback genérico mediante tablas y texto;
- parsing de fechas e importes;
- unión de continuaciones y deduplicación;
- Excel individual, consolidado y resumen mensual;
- CLI para carpetas de entrada y salida.

### `formatoBCP (1).py`

Versión especializada BCP (636 líneas) basada en `pdfplumber`, `pandas`, `openpyxl` y `tqdm`. Contiene metadata, coordenadas, control por página y cuatro hojas de salida. Conserva rutas absolutas y crea una copia limpia junto al PDF original; debe considerarse referencia legacy, no base directa de una API.

### `convertir_excel_a_csv.py`

Utilidad de 51 líneas. Se ejecuta al importarla, usa un XLSX fijo y construye nombres CSV fijos. La lógica debe convertirse en una función pura/configurable antes de reutilizarse.

### `diagnosticar_excel.py`

Utilidad de 43 líneas para comprobar la estructura ZIP de un XLSX y abrirlo con `openpyxl`. También se ejecuta al importarla y usa un archivo fijo.

El mapa direccional, las hojas y los contratos por conservar están detallados en [`conversiones-legacy.md`](conversiones-legacy.md). La secuencia confirmada es PDF → XLSX y XLSX → CSV; `diagnosticar_excel.py` valida, pero no convierte. No se encontró una conversión inversa hacia PDF en estos cuatro scripts.

### Datos y resultados

Hay PDFs, XLSX y CSV en la raíz y en carpetas locales. Deben tratarse como datos financieros sensibles y no como fixtures versionables. La `.gitignore` los excluye por defecto.

## Estado técnico confirmado

- Los cuatro scripts compilan sintácticamente con el intérprete Python disponible.
- No existe todavía un repositorio Git inicializado en esta carpeta.
- `backend/pdf-worker` ya tiene `pyproject.toml`, pruebas automáticas y un núcleo inicial; todavía no hay API, base de datos, cola ni frontend ejecutables.
- Hay lógica BCP duplicada entre los dos scripts grandes.
- Algunos archivos y salidas dependen de nombres o rutas fijas.

## Riesgos específicos descubiertos

- `periodo_desde_nombre()` solo reconoce nombres con el patrón `EECCMMYYYY`; los nombres locales visibles usan otros formatos, por lo que el periodo puede quedar vacío.
- El extractor legacy intenta primero la estrategia BCP para cualquier PDF y acepta su resultado si encuentra movimientos. El núcleo nuevo debe rechazar documentos que no sean estados de cuenta compatibles y seleccionar banco/formato con confianza suficiente.
- El fallback genérico extrae texto completo y vuelve a abrir/recorrer el documento, lo cual encarece PDFs grandes.
- Las coordenadas BCP están fijas para un layout concreto; cambios de escala, orientación o plantilla pueden producir filas plausibles pero incorrectas.
- Algunas excepciones de extracción de tablas se silencian con `except Exception`, perdiendo diagnóstico.
- Los `Decimal` se convierten a `float` antes de escribir Excel; debe definirse una política explícita de precisión y redondeo.

## Principio de migración

No reescribir todo de una vez. Primero crear fixtures anonimizados y pruebas de caracterización para fechas, montos, filas, totales y advertencias. Después extraer piezas puras hacia `backend/pdf-worker`, comparando ambos resultados en cada paso.

## Migración iniciada el 2026-08-21

Ya se separaron modelos de dominio, parsing conservador de fechas/importes, saneamiento PDF, detección, layout, filas, continuaciones y reconciliación BCP. El adaptador `pdfplumber` nuevo está conectado y probado de extremo a extremo con un PDF completamente sintético; no se procesó ningún documento bancario real con el nuevo núcleo.
