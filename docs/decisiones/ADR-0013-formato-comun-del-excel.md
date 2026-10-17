# ADR-0013: Formato común del Excel en todos los bancos

- Estado: Aceptada
- Fecha: 2026-10-17
- Amplía: [ADR-0012](ADR-0012-excel-bbva-con-encabezado-y-nombre-del-archivo.md)

## Contexto

ADR-0012 cambió solo el Excel BBVA. Después el responsable del producto pidió
generalizarlo:

- en todas las conversiones, `Resumen` sin estado, extractor, versión ni
  confianza, con el nombre del archivo y una columna de saldo inicial;
- `Cargo/Abono` con signo, como lo imprime el BBVA, y además `Cargo` y `Abono`
  separados, como los imprimen los demás bancos, para todos;
- encontrar por qué los totales del `Resumen` BBVA no coincidían con los de la
  herramienta de referencia.

La diferencia de totales era exactamente el ITF: el `Resumen` BBVA sumaba el
impuesto a los cargos y lo restaba de los abonos, mientras la referencia los deja
brutos y publica el ITF en su propio total. Se comprobó documento por documento
sobre los tres BBVA reales.

## Decisión

Todos los exportadores publican:

- `Resumen` empezando por `Archivo` (el nombre del PDF, escrito al publicar como
  en ADR-0012) y con `Saldo inicial`. Sin estado, extractor, versión ni
  confianza: la API ya los publica y la interfaz los muestra. BCP toma el saldo
  inicial de su fila `SALDO ANTERIOR`; el respaldo genérico, que no lo lee
  declarado, lo deduce de su primera fila solo cuando la validación demostró los
  saldos, y si no lo deja en blanco.
- `Movimientos` con `Cargo/Abono` con signo (abono positivo, cargo negativo)
  junto a las columnas separadas que ya tenía cada banco, con sus rótulos.
  BBVA añade `Cargo` y `Abono`.
- En BBVA, `Cargo`, `Abono` y sus totales son brutos; el ITF va en su columna y
  en `Total ITF`. Se cumple `saldo inicial + abonos − cargos − ITF = saldo final`.

Las demás hojas de cada banco no cambian: `Encabezado` y el retiro de
`Validaciones` siguen siendo solo de BBVA.

## Consecuencias

- Versiones nuevas de todos los extractores (BBVA `0.4.0`, BCP `0.4.0`, Banco de
  la Nación y genérico `0.3.0`, Interbank `0.2.0`), esquemas de libro nuevos y
  perfil `statements-2026.10.17.3`: una subida nueva vuelve a extraer.
- Quien leía columnas por posición debe leerlas por rótulo. El Centro Financiero
  ya lo hacía: prefiere `Cargo/Abono` cuando existe, y para BBVA suma desde las
  filas, así que lee igual los Excel anteriores y los nuevos.
- La prueba de privacidad del contrato BCP admite `Archivo` como única excepción
  documentada: es la etiqueta de su dueño, no un dato leído del documento.
