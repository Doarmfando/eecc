# ADR-0010: El Centro Financiero lee los CSV publicados, no una tabla de movimientos

- Estado: Aceptada
- Fecha: 2026-09-22

## Contexto

El *Centro Financiero* y el *Calendario* se construyeron sobre `mock-transactions.ts`: doce meses de estados de cuenta inventados con semilla fija, uno por banco y mes. Servían para diseñar las pantallas, pero mostraban números que no eran de nadie. Quien subía un estado de cuenta real lo veía en *Historial* y no aparecía en el Centro Financiero; el saldo que sí aparecía era ficticio.

Para cruzar los documentos reales hace falta el detalle de los movimientos, y ahí choca con una regla del proyecto: **no existe tabla de movimientos bancarios**. Es una decisión tomada en [`ADR-0002`](ADR-0002-postgresql-prisma-y-minimizacion-financiera.md) y escrita en la cabecera de `schema.prisma`. La base de datos guarda metadatos de proceso (estado, conteos, advertencias, invariantes, artefactos), nunca fechas, descripciones ni importes.

Al mismo tiempo, esos movimientos **ya existen publicados**: cada trabajo produce un XLSX y un CSV por hoja ([`ADR-0003`](ADR-0003-csv-derivado-del-resultado-validado.md)), entre ellos `…_Movimientos.csv` y `…_Resumen.csv`. La descarga (`GET /v1/jobs/{jobId}/artifacts/{artifactId}/content`) ya está autorizada por persona y trabajo ([`ADR-0009`](ADR-0009-cada-persona-ve-solo-sus-documentos.md)), y esos archivos ya viajan al navegador cuando alguien pulsa *Descargar*.

## Decisión

**El Centro Financiero arma sus datos en el navegador, leyendo los CSV que el worker ya publicó para los trabajos que la persona eligió.**

- La preselección lista el **historial real** (`GET /v1/jobs`), no una lista simulada. Entra un documento solo si dejó artefactos: `SUCCEEDED` o `NEEDS_REVIEW` con `artifactCount > 0`.
- Al consolidar, por cada trabajo elegido se pide su detalle, se localizan sus CSV de `Movimientos` y `Resumen` por el nombre que generó el sistema, y se descargan como texto (`fetchArtifactText`).
- `statement-from-csv.ts` traduce esas filas a un `FinancialStatement`. La lectura entiende los rótulos de los cuatro exportadores (`Fecha proceso`/`Fecha`, `Concepto`/`Descripción`, `Cargo`/`Cargos`/`Gastos`, `Abono`/`Abonos`/`Ingresos`, `Saldo`/`Saldo contable`).
- **Lo que el documento declara no se recalcula.** Los totales y el saldo final salen del `Resumen` si está; el saldo inicial, del `Resumen` o de la fila `PREVIOUS_BALANCE` de BCP. Solo se deriva lo que ningún extractor imprime, y por ese orden.
- Los importes se leen como **centavos enteros** (`lib/money.ts`), a partir de los dígitos del decimal plano que escribe el worker. No se multiplica por 100 en coma flotante.
- Un movimiento se marca conciliado cuando el saldo que declara su fila coincide con el arrastre desde la fila anterior. Sin columna de saldo no hay nada que comprobar y no se marca ninguno.

**No se añade ningún endpoint de movimientos ni ninguna tabla.** NestJS sigue sin abrir ni interpretar hojas de cálculo: sirve los bytes que ya servía.

**El banco de origen se amplía.** El worker detecta la plantilla por su cuenta, así que llegan documentos de bancos que el selector de carga todavía no ofrece. `SourceBankId` añade `nacion` (Banco de la Nación) y `otro` (respaldo genérico) a los cuatro del selector, y se dibujan con un ícono neutro en vez de un logotipo que el proyecto no tiene. Los bancos que se muestran salen de los documentos cargados: no hay filas en cero.

## Alternativas consideradas

- **Persistir los movimientos en PostgreSQL**: es la opción que da consultas agregadas baratas, pero convierte la base de datos en un depósito de información financiera y contradice [`ADR-0002`](ADR-0002-postgresql-prisma-y-minimizacion-financiera.md) y el cupo de retención de [`ADR-0007`](ADR-0007-cupo-de-documentos-por-persona.md). Descartada mientras el producto no necesite consultar lo que ya no está en un artefacto.
- **Un endpoint que lea el CSV en NestJS y devuelva JSON**: ahorraría trabajo al navegador, pero pone a la API a interpretar hojas de cálculo, que es justo lo que `AGENTS.md` le prohíbe, y no evita que el dato viaje igual. Descartada.
- **Que el worker devuelva los movimientos junto al resultado**: obligaría a que la API los reenvíe o los guarde, con el mismo problema. Descartada.
- **Dejar los datos simulados y añadir un aviso**: no resuelve nada; el Centro Financiero seguiría sin servir para lo que existe. Descartada.

## Consecuencias

- Consolidar cuesta una petición de detalle y dos de descarga **por documento**. Con el cupo de 3 documentos por persona son nueve peticiones como mucho, y el resultado no se revalida (`staleTime` infinito): un documento ya procesado no cambia.
- Un trabajo que no publicó su CSV de movimientos no se puede consolidar. Queda fuera y la pantalla avisa cuántos quedaron fuera, en vez de mostrar un consolidado incompleto en silencio.
- Los artefactos viven hoy en el disco del worker. Si se cambia su directorio, los trabajos anteriores pierden la descarga y, con ella, su lugar en el Centro Financiero. Es la misma limitación que ya tenía la descarga.
- La **categoría** de cada movimiento se deduce de palabras de la descripción. Ningún extractor exporta categorías: es una ayuda de lectura y de búsqueda, no un dato del banco, y lo que no encaja queda en «Otros movimientos».
- El *Calendario* sigue con los datos simulados. Comparte los tipos y el acento de banco, así que puede pasar a los datos reales sin volver a diseñar nada.

## Criterio de revisión

Revisar cuando los artefactos pasen al almacenamiento S3-compatible con URL firmadas, o cuando aparezca una función que necesite consultar movimientos de documentos ya borrados por el cupo (comparar años, buscar en todo el historial). Ese sería el momento de decidir si persistirlos, y con qué política de retención.
