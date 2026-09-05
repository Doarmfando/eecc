# Migración desde los scripts legacy

## Fuente principal

Los cuatro scripts legacy viven en `referencias/` en la raíz del repositorio. `convertir_movimientos_pdf_a_excel (1).py` es la referencia principal de extracción y XLSX individual/consolidado. `formatoBCP (1).py` aporta el workbook BCP de cuatro hojas y su control por página. `convertir_excel_a_csv.py` define la conversión de cada hoja a CSV y `diagnosticar_excel.py` aporta controles mínimos de reapertura. El contrato detallado está en [`../../../docs/contexto/conversiones-legacy.md`](../../../docs/contexto/conversiones-legacy.md).

## Orden de migración

1. Normalización de texto, fechas e importes.
2. Saneamiento no destructivo de PDF.
3. Detección de plantilla BCP.
4. Agrupación visual y clasificación de columnas.
5. Filas BCP y continuaciones.
6. Invariantes, control de páginas y reconciliación.
7. Exportación XLSX.
8. Exportación CSV opcional.
9. Fallback genérico, solo después de medir falsos positivos.

Completado hasta el paso 9: al contrato versionado, el mapeo BCP y la publicación atómica se sumaron el escritor físico `openpyxl` con reapertura semántica y el paquete CSV derivado del mismo plan. Se generaron e inspeccionaron ambos artefactos a partir del PDF sintético. El exportador BCP legacy ya se ejecuta lado a lado en `tests/characterization/` sobre el mismo PDF sintético y su resultado coincide fila por fila con el nuevo; el contrato de salida además está congelado en `tests/unit/test_export_contract.py`. Queda pendiente caracterizar el exportador general y la conversión CSV legacy.

## Regla por función

Para cada conducta:

1. crear casos sintéticos equivalentes;
2. documentar diferencias intencionales;
3. migrar sin depender de rutas, `print` ni estado global;
4. comparar resultados semánticos;
5. retirar duplicación solo cuando la cobertura exista.

## Diferencias intencionales iniciales

- El parser nuevo rechaza montos ambiguos en vez de adivinarlos.
- Los importes no se convierten a `float` en el núcleo.
- El saneamiento usa temporales administrados y nunca crea archivos junto al documento fuente.
- La detección BCP requiere señales del contenido y devuelve confianza/evidencia tipada.
- Una fila con fecha inválida queda `UNCLASSIFIED`; no se pega al movimiento anterior.
- Las continuaciones no cruzan páginas ni se adjuntan a saldos/totales sin una regla explícita.
- Los totales declarados y el balance global se comparan con tolerancia decimal sin incluir montos en el reporte de diagnóstico.
- El legacy descartaba en silencio las filas del pie que no podía clasificar; la versión nueva las une a su etiqueta y con ello reconcilia el documento.
- El workbook nuevo reemplaza `Encabezado` por `Validaciones`; no exporta por defecto titular, dirección, cuenta completa ni texto crudo.
- Solo `SUCCEEDED` y `NEEDS_REVIEW` son exportables; `FAILED` no produce un artefacto vacío.
- El fallback genérico del legacy adivinaba si un importe era cargo o abono con palabras de la descripción. El nuevo lee el rol de cada columna desde su encabezado y, si no lo reconoce, se detiene.
- El escritor publica solo después de reabrir y verificar; el legacy guardaba directamente sobre el destino.
- El archivo no expone autor, ruta ni instante de proceso del entorno que lo generó.
- El CSV se deriva del resultado validado y no de un XLSX ya escrito; no existe conversión de workbooks ajenos al sistema.
- El nombre de cada CSV proviene de un identificador validado, no del nombre del documento original.
