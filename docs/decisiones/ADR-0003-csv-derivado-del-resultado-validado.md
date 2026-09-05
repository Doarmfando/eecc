# ADR-0003: CSV derivado del resultado validado, no del XLSX publicado

- Estado: Aceptada
- Fecha: 2026-08-23

## Contexto

El script legacy `convertir_excel_a_csv.py` genera un CSV por hoja leyendo un XLSX ya escrito. El inventario de conversiones dejó abierta la decisión de si el producto nuevo mantendría ese origen o generaría los CSV desde el resultado normalizado.

El worker ya produce un `WorkbookPlan` versionado y validado (`eecc.statement.bcp`) con tipos declarados, importes en `Decimal`, texto neutralizado contra fórmulas y límites comprobados. El escritor XLSX es un adaptador de ese plan y lo verifica reabriéndolo antes de publicar.

Leer el XLSX publicado para producir CSV obligaría a reabrir el archivo, reinterpretar valores que Excel devuelve como punto flotante y volver a decidir tipos que el plan ya declara.

## Decisión

Generar los CSV desde el mismo `WorkbookPlan` validado que alimenta al escritor XLSX. Ambos formatos son adaptadores hermanos del mismo resultado; ninguno depende del otro ni puede publicarse sin que el plan haya pasado su validación.

El contrato del CSV queda fijado así:

- un archivo por hoja del plan, con nombre `{stem}_{Hoja}.csv` y `stem` validado por el llamador;
- codificación `utf-8-sig` y fin de línea `\r\n`, para que Excel abra el archivo sin pasos manuales;
- delimitador `,` y `QUOTE_MINIMAL` según RFC 4180;
- fechas en ISO-8601, importes como decimal simple con punto y sin separador de miles, booleanos como `true`/`false`, ausencia como campo vacío;
- el mismo texto ya neutralizado por el contrato, sin volver a transformarlo en el borde;
- escritura a temporal, relectura y comparación contra el plan antes de publicar cada archivo.

El XLSX sigue siendo el artefacto de lectura humana; el CSV es el artefacto legible por máquina.

## Alternativas consideradas

- Generar CSV leyendo el XLSX publicado, como el legacy: reproduce el flujo conocido, pero degrada los importes a punto flotante, obliga a inferir tipos ya declarados y hace que un formato dependa del otro; descartada.
- Exponer un conversor XLSX a CSV de propósito general: contradice el límite de dominio del producto, que solo procesa estados de cuenta reconocidos; descartada.
- Un único CSV con todas las hojas concatenadas: pierde la forma tabular por hoja y complica la carga automatizada; descartada.
- Formatear importes y fechas según configuración regional en el CSV: mejora la lectura directa en Excel, pero rompe el consumo automatizado y depende del entorno; descartada para el CSV, que ya tiene al XLSX como salida presentable.

## Consecuencias

- El generador de CSV vive en `exporters` y usa solo la biblioteca estándar; no necesita `openpyxl`.
- Un cambio en el plan se refleja en ambos formatos a la vez y una regresión aparece en las pruebas de ambos adaptadores.
- No existe una ruta que convierta un XLSX arbitrario del usuario a CSV; la entrada siempre es un resultado extraído y validado por el worker.
- Publicar un paquete de CSV falla completo si cualquier archivo no supera su verificación; los archivos ya publicados por esa misma llamada se retiran.
- Si en el futuro se requiere CSV con formato regional, será una opción explícita del contrato y no un cambio silencioso del borde.

## Criterio de revisión

Revisar si aparece un consumidor que exija delimitador, codificación o formato regional distintos, o si el producto decide ofrecer descarga de CSV para workbooks que el sistema no generó.
