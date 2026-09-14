# Arquitectura interna

## Regla de dependencias

```text
api/tasks ──► services ──► domain
                 ▲
   extractors ───┘──► parsing
```

`api` y `tasks` resuelven la estrategia en el registro y llaman al servicio de trabajo. Ninguno conoce bancos, formatos ni librerías de lectura o escritura.

Las flechas apuntan hacia el núcleo. El dominio no conoce frameworks ni formatos de transporte.

## Capas

- `domain`: contratos inmutables, errores e invariantes comunes.
- `parsing`: funciones puras para texto, fechas e importes.
- `extractors`: detección y extracción específica por banco/versión.
- `services`: selección de estrategia, pipeline, saneamiento y validación transversal.
- `config`: configuración tipada leída del entorno, sin rutas fijas ni secretos en el código.
- `api` y `tasks`: traducen HTTP y Celery a llamadas de servicios.

## Privacidad por diseño

`DocumentProbe` contiene texto solo durante la detección. `Detection` devuelve códigos de evidencia como `BANK_MARKER_BCP`; nunca devuelve el texto coincidente. Los errores públicos se construirán a partir de códigos de dominio, no de excepciones con contenido.

El directorio temporal puede inyectarse en `sanitized_pdf_path`. En despliegue se configurará un volumen aislado con cuota, permisos mínimos y limpieza al terminar cada contexto.

## Política numérica

Los importes permanecen como `Decimal`. Cargo y abono son magnitudes no negativas; el signo económico se deriva de su columna. La conversión requerida por XLSX se hará exclusivamente en el adaptador de exportación y tendrá pruebas de reconciliación.

## Filas BCP

El layout BCP se reconstruye con modelos propios (`PdfWord`, `BcpVisualRow`, `BcpParsedRow`) antes de llegar al dominio común. Una fecha presente pero inválida produce `UNCLASSIFIED` y una advertencia; nunca se interpreta como continuación. Las continuaciones solo se unen con un movimiento inmediatamente anterior de la misma página. Conflictos de importes se preservan mediante códigos de advertencia y no sobrescriben el valor previo.

## Adaptador `pdfplumber`

`read_bcp_pdf_with_pdfplumber` es el único límite que conoce `pdfplumber`. Abre el archivo una vez, obtiene el `DocumentProbe` de la primera página, recorta la región útil de cada página y transforma palabras en `PdfWord`. No contiene reglas de movimientos ni dependencias de HTTP, colas, almacenamiento o base de datos.

El servicio `process_bcp_pdf` aplica primero el saneamiento no destructivo, lee solo la primera página para exigir la confianza mínima del detector, y únicamente entonces recorre el resto del documento y llama al pipeline puro. Un estado de cuenta real tiene cientos de páginas: rechazarlo después de leerlas todas desperdicia medio minuto. Las métricas por página exponen únicamente conteos, límites y banderas de detección; no copian texto ni importes.

### Lectura repartida entre procesos

Casi todo el tiempo de un documento real se va en que `pdfplumber` convierta sus caracteres en palabras: en el estado de cuenta de 425 páginas son 1,5 millones de objetos de carácter, y el perfilado atribuye a `extract_words` alrededor del 95 % del total. No hay nada que optimizar dentro de esa conversión; lo que sí se puede es hacerla a la vez, porque **las páginas son independientes entre sí**.

`read_bcp_pdf_with_pdfplumber` reparte el documento en tramos contiguos, cada uno leído en su propio proceso, que reabre el PDF y devuelve `_PageReadout` por página. El resultado se reordena por número de página, de modo que **es idéntico al secuencial**, no equivalente: `tests/integration/test_parallel_page_reading.py` compara filas, métricas y sonda entre ambos caminos, y comprueba que cada página conserva su propio contenido.

`extractors/page_parallelism.py` guarda lo único común a todos los extractores —cuántos procesos, cómo se trocea el documento y cómo se lanzan— porque «cuántos procesos para N páginas» no es conocimiento bancario. Cada extractor aporta su propio lector de tramo. Los tramos cubren el documento entero sin huecos ni repeticiones, y eso se comprueba para varios tamaños y repartos, incluido el caso de más procesos que páginas.

Dos umbrales, ambos medidos y no elegidos por gusto:

- `PARALLEL_PAGE_THRESHOLD = 24`. Arrancar ocho procesos e importar el adaptador en cada uno cuesta 0,37 s en esta máquina. Por debajo de dos docenas de páginas, ese arranque es mayor que el ahorro, así que el documento se lee en el proceso actual.
- `MAX_PARALLEL_WORKERS = 8`, y nunca más de `cpu_count() - 1`, para dejar un núcleo al proceso que atiende la petición.

El pool se crea y se destruye por documento. Mantener uno compartido ahorraría esos 0,37 s de un trabajo de 11 s —un 3 %— a cambio de estado global mutable, procesos huérfanos y un modo de fallo nuevo cuando un hijo muere. No compensa.

**El reparto es una optimización, y una optimización que falla no puede tumbar la petición.** Si la máquina no puede con el pool —un hijo muere, no quedan procesos, el entorno no admite `spawn`—, `read_pages_in_parallel` lanza `ParallelReadUnavailableError` y el adaptador lee el documento en este mismo proceso: más despacio, con el mismo resultado. Sin esa red, un `BrokenProcessPool` habría salido como HTTP 500 con traza, justo lo que el diseño evita en todos los demás límites. Un error *del documento* sí viaja intacto desde el hijo, porque repetirlo daría lo mismo. Leer secuencialmente es exactamente «un tramo que cubre todo el documento», así que no hay dos caminos que puedan divergir.

Queda pendiente que la caída al camino secuencial sea visible en operación: el worker todavía no tiene logging, y no se ha añadido solo para esto.

Medición sobre los dos estados de cuenta reales, con resultado idéntico byte a byte en ambos:

| Documento | Páginas | Secuencial | Repartido | |
|---|---:|---:|---:|---|
| Documento A | 425 | 35,1 s | 10,4 s | 3,4× |
| Documento B | 447 | 38,2 s | 11,8 s | 3,2× |

Extremo a extremo por HTTP, incluidos exportación y checksums, el primero pasó de 42,4 s a 15,4 s.

## Pipeline y reconciliación

`process_bcp_visual_rows` conecta las reglas puras:

```text
filas visuales → parseo tipado → unión conservadora
               → invariantes/reconciliación → estado final
```

El reporte valida filas presentes, clasificación completa, campos de movimientos, exclusividad cargo/abono, totales declarados y balance global. Los reportes solo contienen estados, códigos y conteos; no incluyen descripciones ni importes. La ausencia de un total o balance opcional produce `SKIPPED`, una discrepancia produce `NEEDS_REVIEW` y cero filas produce `FAILED`.

## Extractor Interbank

`extractors/interbank/` cubre el estado de cuenta de ahorro de Interbank (`interbank-savings-v1`). Sigue la misma separación que BCP: `pdfplumber_adapter.py` convierte palabras en filas visuales —repartiendo páginas entre procesos con `page_parallelism`— y `rows.py` las interpreta sin tocar el PDF.

La plantilla trae su propia prueba de lectura, así que no hace falta deducir nada:

- `EMPEZASTE <MES> CON <saldo>` es el saldo inicial;
- cada movimiento es `dd/mm/aaaa <concepto> <±importe> <saldo>`; el signo decide si es ingreso o gasto, y solo un importe sin signo se asigna por la posición de las columnas de la cabecera;
- `SALDO CONTABLE AL dd/mm <+ingresos> <-gastos> <saldo>` cierra el documento.

`validation.py` exige cuatro cosas al céntimo, sin tolerancia: saldo inicial presente, saldo que avanza tras cada movimiento, totales declarados iguales a la suma de movimientos, y saldo final igual al último saldo y a `inicial + ingresos − gastos`. Si falta el cierre el resultado es `NEEDS_REVIEW`: un documento truncado también produce filas.

La lectura se detiene en la fila de cierre. Después el banco imprime publicidad y una guía con un **ejemplo inventado** que reproduce la plantilla entera; la guía se descarta también por su título por si el cierre faltara. El Excel usa el esquema `eecc.statement.interbank` con los rótulos del propio documento (`Ingresos`, `Gastos`, `Saldo contable`) y no exporta titular, DNI ni número de cuenta.

`resolve_best_strategy` prueba BCP, luego Interbank y solo después el respaldo genérico. La cabecera sola no basta para aceptar el documento: `Ingresos` y `Gastos` son rótulos comunes, y lo que identifica la plantilla es la fila `EMPEZASTE`.

## Respaldo genérico

`extractors/generic/` cubre los bancos que todavía no tienen extractor especializado. Su regla es no adivinar: identifica el encabezado de la tabla, traduce cada columna a un rol conocido mediante sinónimos (`RETIROS`/`CARGOS`/`DEBE`, `DEPOSITOS`/`ABONOS`/`HABER`, `SALDO`) y solo lee las columnas que pudo nombrar. Si el encabezado no se reconoce, el resultado es `FAILED` con `GENERIC_HEADER_NOT_RECOGNISED`, nunca una asignación inventada de cargos y abonos.

La única prueba objetiva disponible sin conocer la plantilla es la continuidad del saldo: si la columna de saldo avanza fila a fila restando cargos y sumando abonos durante al menos cinco transiciones, el resultado se declara reconciliado. En cualquier otro caso queda en `NEEDS_REVIEW`.

Las columnas no se toman de cómo un extractor de tablas trocee cada página. `word_grid.py` construye una rejilla a partir de la posición de las palabras: agrupa filas con una tolerancia deducida del interlineado del propio documento y separa columnas por los huecos horizontales que ninguna palabra de una fila de movimiento ocupa. Así el índice de una columna significa lo mismo en la página 1 y en la 400.

`document.py` resuelve el mapa una sola vez para todo el documento y lo aplica a cada página: el encabezado suele imprimirse solo en la primera. Una fila que solo trae texto se une a la descripción del movimiento anterior, porque las descripciones largas se parten en varias líneas.

Cuando el encabezado no pertenece a ningún vocabulario conocido, `inference.py` deduce el rol de cada columna resolviendo la aritmética del documento: de todas las formas de asignar las columnas numéricas a cargo, abono y saldo, solo una hace que el saldo avance correctamente fila tras fila. Si ninguna cuadra, o si más de una lo hace, no se deduce nada. Esta vía cubre también los estados de cuenta sin fila de encabezado y los importes con signo en una sola columna.

El resultado se marca con `GENERIC_COLUMNS_INFERRED` para que quede constancia de que las columnas se dedujeron en vez de leerse.

La detección del respaldo pesa sobre todo la estructura: una tabla de al menos cinco filas fechadas con importes alineados vale más que cualquier palabra, porque no depende del idioma. Las palabras solo confirman que el documento se presenta como estado de cuenta.

`resolve_best_strategy` prueba primero las plantillas conocidas y solo después el respaldo; un documento que no parece un estado de cuenta se rechaza con `UNSUPPORTED_DOCUMENT`.

El respaldo lee las páginas repartidas entre procesos igual que el extractor BCP, y por el mismo motivo: un banco cualquiera puede traer tantas páginas, y aquí cada una cuesta más —dos estrategias de extracción de tablas además de las palabras de la rejilla—. Sobre las 425 páginas reales, 54,0 s pasan a 20,7 s (2,6×) con tablas, rejilla y sonda idénticas. `max_pages` sigue acotando la lectura: repartir no puede leer de más.

## Semántica confirmada de la plantilla

Verificado sobre dos estados de cuenta reales de 425 y 447 páginas:

- el banco no aparece como texto, así que la detección se apoya en la firma estructural;
- la etiqueta del pie y sus importes ocupan líneas base distintas, separadas 5.2-6.7 puntos, frente a los 11.2-11.4 que separan dos movimientos;
- `TOTAL MOVIMIENTO` se rotula en cada página pero solo trae cifras al final, y ese total es el del documento completo;
- la invariante `BCP_DECLARED_TOTALS` compara cada total impreso con su página, salvo cuando existe uno solo en un documento de varias páginas: entonces se contrasta contra todo el documento.

## Contrato de workbook

`build_bcp_workbook_plan` transforma únicamente resultados BCP utilizables en el esquema versionado `eecc.statement.bcp` versión 1. El plan contiene `Resumen`, `Movimientos`, `Control_Paginas` y `Validaciones`, con tipos, formatos numéricos, anchos, nombres de tabla y límites explícitos antes de invocar una librería XLSX.

Los resultados `SUCCEEDED` y `NEEDS_REVIEW` pueden producir un plan; `FAILED` se rechaza. Todo texto no confiable se normaliza para XML y se prefija cuando podría interpretarse como fórmula. Los importes siguen siendo `Decimal` dentro del plan. El escritor físico será otro adaptador y no podrá cambiar reglas bancarias.

## Escritor XLSX

`exporters/xlsx_writer.py` es el único módulo que importa `openpyxl` y no se reexporta desde `exporters/__init__.py`: el contrato puro sigue importándose sin la librería de escritura. Recibe un plan ya validado, escribe encabezado con estilo fijo, anchos declarados, formatos numéricos por columna, panel congelado en `A2` y una tabla Excel por hoja con datos; una hoja sin filas usa autofiltro en lugar de una tabla de solo encabezado.

Todo texto se escribe forzando el tipo de celda textual, de modo que un valor ya neutralizado por el contrato tampoco puede convertirse en fórmula al serializarse. Las propiedades del documento declaran un autor propio del servicio y una marca de creación fija; no se copia usuario, ruta ni instante real de proceso más allá del `modified` que sella la librería.

`verify_workbook_file` reabre el archivo en modo de solo lectura y compara nombres de hojas, forma, encabezados y cada valor tipado contra el mismo plan. Los importes se comparan como decimales normalizados porque Excel devuelve números en punto flotante al releer; nunca se comparan bytes. `export_workbook_plan` encadena validación, escritura y verificación dentro de la publicación atómica.

## Exportación CSV

`exporters/csv_export.py` consume el mismo `WorkbookPlan` que el escritor XLSX y solo usa la biblioteca estándar, según [`ADR-0003`](../../../docs/decisiones/ADR-0003-csv-derivado-del-resultado-validado.md). Publica un archivo por hoja con codificación `utf-8-sig`, fin de línea `

`, delimitador `,` y entrecomillado mínimo.

El borde textual no reinterpreta valores: fechas en ISO-8601, importes como decimal con punto, booleanos `true`/`false`, ausencia como campo vacío y texto tal como el contrato ya lo neutralizó. El nombre de cada archivo se deriva de un identificador validado por el llamador más el nombre de la hoja normalizado; nunca del documento original. `verify_sheet_csv` relee el archivo campo por campo antes de publicarlo.

## Estrategias y registro

`services/strategy.py` define el puerto que consume el servicio de trabajo: una estrategia recibe un PDF autorizado y devuelve un `StatementOutcome` con detección, estado, conteos, códigos y, si el resultado es exportable, el plan de salida. El puerto vive junto a su consumidor; los bancos lo implementan.

`extractors/bcp/strategy.py` es la implementación BCP y el único lugar donde se unen el pipeline BCP y el mapeo de workbook. `extractors/registry.py` resuelve un identificador de extractor a su estrategia y falla con `UNSUPPORTED_DOCUMENT` si no existe.

## Trabajo y idempotencia

`services/statement_job.py` orquesta sin conocer bancos: valida tamaño, ejecuta la estrategia en un temporal aislado, publica los formatos pedidos en `artifact_root/<job_id>/` y escribe al final un `result.json` con el resumen seguro.

El identificador del trabajo es un SHA-256 del contenido, la estrategia y las opciones. Repetir la misma entrada devuelve el manifiesto anterior sin volver a escribir; un directorio sin manifiesto se considera incompleto y se completa sobrescribiendo, porque su entrada es idéntica por construcción. Un resultado `FAILED` también se registra: no produce artefactos, pero deja constancia de sus códigos.

## API interna y cola

`api/app.py` construye la aplicación con la configuración inyectada, limita el tamaño del archivo mientras lo recibe por bloques, guarda la carga en un temporal que siempre se elimina y traduce los errores de dominio a códigos HTTP. Las respuestas contienen identificadores, estados, conteos y códigos; nunca descripciones, importes ni rutas locales.

### El documento no bloquea el servicio

Procesar un estado de cuenta ocupa la CPU durante segundos. Hecho dentro del bucle de eventos, deja al proceso entero sin atender: medido contra el servicio en marcha, `/health` tardó **39 s** en contestar mientras se procesaba un documento, frente a 1,5 ms en reposo. Un balanceador con sondas de salud habría dado el worker por caído justo cuando estaba trabajando bien.

Todo el trabajo bloqueante vive en `_process_document`, y el manejador lo ejecuta con `run_in_threadpool`. `tests/integration/test_api_responsiveness.py` fija la corrección: comprueba que `/health` responde **mientras la subida sigue pendiente**, no simplemente que acabe respondiendo.

Sacar el trabajo del bucle habilita concurrencia real, y con ella el problema contrario: cuatro documentos a la vez pedirían 32 procesos a una máquina que no los tiene. Un semáforo de `max_concurrent_documents` (2 por defecto) hace esperar a los que sobran; la espera ocurre del lado asíncrono, así que el servicio sigue respondiendo mientras tanto.

`tasks/celery_app.py` configura la cola interna con serialización JSON, `acks_late`, prefetch unitario y límites de tiempo tomados de la configuración. `tasks/statement_tasks.py` separa el cuerpo puro de la tarea de su decorador para poder probarlo sin broker; los errores de dominio no se reintentan porque no son transitorios.

## Publicación atómica

`publish_artifacts_atomically` escribe y verifica todos los temporales del paquete antes de mover cualquiera a su destino, de modo que una verificación fallida no deja una salida parcial. `publish_artifact_atomically` es el caso de un solo archivo.

La publicación ocurre en el mismo directorio/volumen del destino, después de cerrar y verificar. Por defecto no sobrescribe un artefacto existente; una falla elimina los temporales, retira lo que esa misma llamada publicó y conserva los destinos anteriores. Con `overwrite` no existe copia previa que restaurar.
