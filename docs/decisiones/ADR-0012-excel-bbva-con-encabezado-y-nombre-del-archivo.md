# ADR-0012: Excel BBVA con encabezado de la cuenta y nombre del archivo

- Estado: Aceptada
- Fecha: 2026-10-17
- Amplía: [ADR-0011](ADR-0011-nombre-privado-del-documento.md)

## Contexto

La migración retiró la hoja `Encabezado` del legacy y dejó dicho que titular,
dirección y cuenta completa no se exportarían «sin una necesidad de producto y
retención explícitas». Al comparar el Excel BBVA con el de otra herramienta, el
responsable del producto pidió explícitamente:

- la hoja `Encabezado` con los datos de la cuenta;
- en `Resumen`, el nombre del PDF en lugar de estado, extractor, versión y confianza;
- quitar la hoja `Validaciones`;
- una columna `Tipo de fila` y el `SALDO ANTERIOR` como fila de `Movimientos`;
- en `Control_Paginas`, filas y columnas extraídas en lugar de palabras;
- el tipo de cuenta (ahorro o corriente) para agrupar el historial;
- que las descargas lleven el nombre del PDF de origen.

## Decisión

Solo para BBVA, que es el banco con referencia comparada; el resto de los
extractores conserva su libro.

`Encabezado` (campo, valor) publica lo que el documento imprime: banco, producto,
titular, dirección, moneda, RUC, ejecutivo de cuenta, CCI, oficina, fecha del
estado, código de cuenta y hoja. Cada dato se lee por su rótulo; uno ausente
queda en blanco. Estos datos viven únicamente dentro del XLSX y su CSV, que ya
contenían todos los movimientos y caen bajo la retención de ADR-0007. No entran
en PostgreSQL, en la respuesta de la API, en el manifiesto del worker ni en los
registros.

`Resumen` empieza por `Archivo` y `Tipo de cuenta` (`AHORRO` o `CORRIENTE`,
deducido del producto: `CONTIAHORRO` es ahorro). `Movimientos` cuenta también la
fila de saldo anterior. Las invariantes salen del libro, pero siguen calculándose,
publicándose en la API y mostrándose en la interfaz: dejar de imprimirlas no
cambia cuándo un resultado queda en `NEEDS_REVIEW`.

El nombre del PDF llega al worker como campo `source_file_name`, ya saneado por la
API. Ninguna estrategia lo recibe: el trabajo lo escribe al publicar en la
columna que el exportador declara. Forma parte de la identidad del trabajo del
worker, porque ese directorio se comparte por contenido: sin esto, otra persona
que subiera el mismo PDF con otro nombre recibiría un libro con el nombre que le
puso la primera.

El navegador guarda cada descarga con el nombre del PDF (`Agosto.pdf` →
`Agosto.xlsx`, `Agosto_Movimientos.csv`). La API sigue sirviendo nombres
derivados del trabajo: el nombre no viaja en ninguna cabecera nueva.

## Consecuencias

- Versiones nuevas: BBVA `0.3.0`, esquema `eecc.statement.bbva` 2 y perfil
  `statements-2026.10.17.2`. Los resultados BBVA anteriores no se reescriben.
- Repetir el mismo PDF con otro nombre reutiliza el trabajo de la API (ADR-0011):
  la etiqueta se actualiza, pero el Excel conserva el nombre con el que se generó.
- El historial agrupa por tipo de cuenta solo cuando el `Resumen` lo declara; los
  demás bancos quedan sin tipo hasta que su extractor lea la cabecera.
- `Encabezado` amplía la información identificable de cada libro. Revisar esta
  decisión antes de compartir libros entre personas o enviarlos a terceros.
