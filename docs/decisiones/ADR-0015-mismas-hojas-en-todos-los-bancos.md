# ADR-0015: Mismas hojas en todos los bancos y columnas separadas del BBVA

- Estado: Aceptada
- Fecha: 2026-10-19
- Amplía: [ADR-0012](ADR-0012-excel-bbva-con-encabezado-y-nombre-del-archivo.md) y
  [ADR-0013](ADR-0013-formato-comun-del-excel.md)

## Contexto

ADR-0013 generalizó el `Resumen` y `Cargo/Abono`, pero dejó `Encabezado`, el
retiro de `Validaciones` y el nuevo `Control_Paginas` solo en BBVA. El
responsable del producto pidió que los Excel cumplan con los libros de
referencia de otra herramienta, que también incluyen dos BCP, y después que lo
mismo valga para Banco de la Nación e Interbank. La otra herramienta es el
exportador legacy (`formatoBCP (1).py`), así que sus hojas son las mismas que
retiró la migración:

- BCP publica `Resumen`, `Encabezado`, `Movimientos` y `Control_Paginas`, con el
  tipo de fila en español (`SALDO_ANTERIOR`, `MOVIMIENTO`, `TOTAL_MOVIMIENTO`,
  `SALDO`) y sin `Validaciones`;
- el `Movimientos` BBVA separa `oficina`, `can` y `nro_operacion` de la
  descripción.

## Decisión

- Todos los bancos con plantilla —BBVA, BCP, Banco de la Nación e Interbank—
  publican las mismas cuatro hojas: `Resumen` con `Tipo de cuenta` y `Filas`,
  `Encabezado`, `Movimientos` con `Tipo de fila` y `Control_Paginas`.
- Cada banco lee su cabecera por rótulos y forma (`extractors/<banco>/header.py`)
  y empieza por su título: sin él no lee nada, para no tomar por titular lo que
  imprima otra disposición. `Encabezado` lleva lo que imprime cada banco:
  - BCP: producto, titular, dirección, código de cuenta, moneda, periodo y
    páginas declaradas;
  - Banco de la Nación: producto, titular, dirección, código de cliente, nombre y
    número de cuenta, fecha del estado, fecha de impresión y página;
  - Interbank: producto, titular, documento de identidad, número de cuenta,
    moneda, periodo y fecha de apertura.
- `Movimientos` incluye, con su tipo, las filas que no son movimientos:
  `SALDO_ANTERIOR`, `TOTAL_MOVIMIENTO`, `SALDO` y, en Banco de la Nación,
  `SALDO_ARRASTRADO` para `VAN`/`VIENEN`. BCP usa los rótulos del legacy, que son
  los de BBVA.
- La familia de la cuenta sale del nombre del producto
  (`parsing/account_type.py`): los nombres que dicen `AHORRO`, `CORRIENTE` o
  `CTA CTE`, y una tabla por banco para los que no lo dicen (`CUENTA SIMPLE` es
  ahorro en Interbank).
- Ningún banco publica `Validaciones`: las invariantes las publican la API y la
  interfaz, y el libro dice cuántas advertencias hubo.
- `Control_Paginas` común: página, filas extraídas, columnas extraídas y
  cabecera detectada. Las filas son las que publica `Movimientos` en esa página,
  así que la hoja suma lo mismo que el `Resumen`; las columnas, las leídas del
  documento con al menos un valor, sin contar `Cargo/Abono`, que se deriva.
  Interbank conserva además `Página de guía`.
- El genérico, sin plantilla, publica `Tipo de fila` (todas sus filas son
  movimientos) y `Control_Paginas`, con la cabecera detectada en blanco porque
  solo la conoce para el documento entero. No publica `Encabezado` ni tipo de
  cuenta.
- El BBVA reparte lo que precede a los importes según los rótulos `OFICINA`,
  `CAN` y `N° OPER.` de la cabecera. Cada columna empieza a medio camino entre el
  rótulo anterior y el suyo, porque los datos no se alinean con su rótulo. Sin
  esos rótulos, todo queda en la descripción, como antes.

## Consecuencias

- `Encabezado` amplía a todos los bancos con plantilla la información
  identificable del libro, con la misma justificación y los mismos límites de
  ADR-0012: solo viaja al Excel de su dueño; nunca a registros, manifiestos, la
  API ni la base de datos.
- El Banco de la Nación no declara su moneda en ninguna página del documento
  real: la celda queda vacía y la interfaz sigue mostrándolo en soles.
- La cabecera Interbank sigue la disposición del documento real con que se
  confirmó la plantilla, reproducida en el sintético; ese documento ya no está
  disponible para volver a contrastarla.
- La referencia y el nuevo difieren a propósito en `Filas extraídas`: el legacy
  cuenta aparte la segunda línea de un concepto partido, aunque su propio
  `Resumen` no lo haga. También difiere el separador entre esas dos líneas: la
  referencia usa « | » y el nuevo, un espacio.
- Añadir un tipo de cuenta distinto de `AHORRO` y `CORRIENTE` exige hoy tocar el
  worker (`AccountType`) y la interfaz, que lista los tipos que filtra.
- Versiones nuevas: BBVA y BCP `0.5.0`, Banco de la Nación y genérico `0.4.0`,
  Interbank `0.3.0`; esquemas BBVA 4, BCP 3, Banco de la Nación 3, Interbank 3 y
  genérico 3; perfil `statements-2026.10.18`.
- El Centro Financiero sigue leyendo los libros anteriores, sin tipo de fila o
  con los tipos BCP en inglés, y agrupa por tipo de cuenta los nuevos de todos
  los bancos con plantilla.
