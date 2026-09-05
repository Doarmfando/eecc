# Conversiones legacy y contratos por preservar

Este inventario registra las fuentes legacy que deben consultarse antes de implementar exportación XLSX o CSV. Los scripts y los documentos de muestra viven en [`referencias/`](../../referencias). La auditoría es únicamente de código: no requiere abrir PDFs, XLSX ni CSV bancarios locales.

## Límite de dominio

Todas las conversiones descritas aquí pertenecen exclusivamente a estados de cuenta bancarios. El producto nuevo no ofrecerá conversión genérica de documentos:

- PDF de entrada: debe ser detectado como una plantilla de estado de cuenta compatible.
- XLSX de entrada para CSV: debe haber sido generado por el sistema o superar la validación de un esquema versionado de estado de cuenta.
- CSV: es un formato de salida derivado de movimientos bancarios validados, no una transformación libre de cualquier workbook.
- Un archivo no reconocido se rechaza de forma segura; no se procesa intentando “rescatar” filas arbitrarias.

## Mapa real de conversiones

```text
PDF(s) ──► XLSX individual y consolidado
   │
   └────► XLSX especializado BCP

XLSX de estado de cuenta validado ───► uno o más CSV de salida
  │
  └─────► diagnóstico estructural, sin conversión
```

No se encontró una conversión XLSX/CSV a PDF ni CSV a XLSX en estos cuatro scripts. Si esa dirección también forma parte del producto, deberá definirse como requisito nuevo y no atribuirse al comportamiento legacy.

## Fuentes exactas

### [`convertir_movimientos_pdf_a_excel (1).py`](../../referencias/convertir_movimientos_pdf_a_excel%20%281%29.py)

Es la referencia principal para PDF a Excel. Procesa una carpeta, intenta extracción BCP por coordenadas y luego un fallback genérico.

Salidas observadas en código:

- un XLSX por PDF con la hoja `Movimientos`;
- `movimientos_general.xlsx` con `Movimientos`, `Resumen_mensual` y `Archivos`;
- formato de fechas e importes, filtros, panel congelado, ancho de columnas y tablas;
- resumen por periodo y estado por archivo.

La hoja de movimientos usa estas columnas legacy: `archivo_pdf`, `periodo`, `tipo_fila`, `fecha`, `fecha_proc`, `fecha_valor`, `descripcion`, `cargo`, `abono`, `monto`, `saldo`, `moneda`, `cuenta`, `pagina`, `fuente` y `linea_original`.

### [`formatoBCP (1).py`](../../referencias/formatoBCP%20%281%29.py)

Es la referencia especializada BCP. Produce cuatro hojas:

- `Resumen`;
- `Encabezado`;
- `Movimientos`;
- `Control_Paginas`.

Su control por página y su resumen sirven como referencia funcional. Sus rutas absolutas, salida con `float`, metadata financiera extensa y copia limpia junto al origen no deben migrarse literalmente.

### [`convertir_excel_a_csv.py`](../../referencias/convertir_excel_a_csv.py)

Convierte cada hoja de un XLSX en un CSV separado con `utf-8-sig`. El script legacy puede recibir cualquier workbook, pero esa amplitud no forma parte del producto nuevo. Actualmente usa nombre de entrada y prefijo de salida fijos, se ejecuta al importarse y captura excepciones de forma demasiado amplia.

Resuelto en [`ADR-0003`](../decisiones/ADR-0003-csv-derivado-del-resultado-validado.md): los CSV se generan desde el mismo resultado validado que alimenta al XLSX, no releyendo el workbook publicado. La implementación tiene función configurable, nombres derivados de un identificador validado, la neutralización de fórmulas heredada del contrato y ninguna ruta que acepte workbooks ajenos al sistema.

### [`diagnosticar_excel.py`](../../referencias/diagnosticar_excel.py)

No convierte archivos. Comprueba que el XLSX sea ZIP, busca una parte estructural mínima y después intenta abrirlo con `openpyxl`, mostrando hojas y dimensiones.

La implementación nueva reutilizará la intención, no el script: después de guardar a un temporal deberá reabrir el workbook y validar hojas, encabezados, tipos y conteos antes de publicarlo.

## Comportamiento a caracterizar

Las pruebas sintéticas de exportación deben cubrir:

1. XLSX individual con hoja `Movimientos` y encabezados esperados.
2. XLSX consolidado con movimientos, resumen mensual y estado de archivos.
3. Salida BCP con resumen, encabezado, movimientos y control por página, o una diferencia intencional documentada hacia un formato unificado.
4. Fechas como fechas de Excel e importes con formato financiero explícito.
5. Protección contra fórmulas en todo texto no confiable que empiece con `=`, `+`, `-` o `@`.
6. Escritura a temporal, cierre, reapertura semántica y publicación atómica.
7. Límite de filas, nombres válidos/únicos de hojas y tablas, y ausencia de rutas locales en el workbook.
8. CSV con codificación definida, quoting correcto y la misma protección contra fórmulas.

## Diferencias intencionales de la migración

- `Decimal` se conserva durante cálculos y reconciliación; cualquier conversión ocurre únicamente en el borde del formato.
- Los archivos de salida no heredan nombres sensibles como claves de almacenamiento ni registran rutas locales.
- `linea_original`, titular, dirección y cuenta completa no se incluyen por defecto sin una necesidad de producto y retención explícitas.
- Los exportadores reciben datos ya validados; no repiten extracción ni reglas bancarias.
- Un XLSX que solo sea un ZIP válido no se considera correcto: debe pasar validación semántica después de guardarse.
