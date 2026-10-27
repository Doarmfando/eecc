# Fallos y trampas

## Datos y seguridad

- Los documentos contienen información financiera. Nunca incluir su texto, nombres, cuentas o importes en logs, excepciones públicas, telemetría o fixtures.
- Extensión y `Content-Type` no prueban que un archivo sea PDF. Validar firma, estructura, límites y rechazo seguro.
- Proteger contra archivos enormes, PDFs cifrados, page bombs, ZIP bombs en XLSX y tiempos de procesamiento ilimitados.
- Los nombres originales no deben convertirse directamente en claves S3 ni rutas temporales.
- Una traza no es un diagnóstico seguro: su primera línea incluye el mensaje de la excepción y Prisma puede incorporar valores de una consulta. Registrar códigos controlados, referencia, estado y rol, nunca el objeto `Error` ni su `stack`.
- Un rechazo antes de crear el trabajo necesita su propia evidencia. Guardar un evento de auditoría con código, actor, referencia y tamaño, sin PDF, nombre ni contraseña; si falla esa escritura, conservar el rechazo original. Los logs HTTP no sustituyen una auditoría durable.

## PDF y extracción

- Algunos documentos pueden tener bytes fuera del cuerpo PDF. La limpieza debe usar un archivo temporal aislado, conservar el original y eliminar siempre el temporal.
- Un PDF válido puede ser escaneado y no tener capa de texto. “Cero filas” debe producir una causa explícita, no un Excel vacío exitoso.
- Las coordenadas BCP actuales son específicas de una plantilla. Antes de usarlas, detectar banco, versión, tamaño/orientación y confianza.
- Una fila plausible puede estar en la columna equivocada. Validar totales, fechas, moneda, páginas y continuidad de saldo.
- No depender del nombre para determinar periodo o banco. Los nombres actuales ya muestran formatos que el regex legacy no cubre.
- Evitar recorrer dos veces todas las páginas y extraer texto completo cuando basta una región. Medir memoria y tiempo con límites representativos.
- No silenciar `Exception`. Capturar errores esperados, añadir contexto seguro y conservar la causa para diagnóstico interno.
- La unión de continuaciones nunca debe adjuntar texto a un saldo, total o movimiento de otra página sin reglas explícitas.
- Una fila con texto en columnas de fecha pero fecha inválida no es una continuación; debe quedar no clasificada y generar advertencia.
- **Un PDF protegido con contraseña no es un PDF ilegible.** Los bancos los envían así por correo (casi siempre con el DNI), y pdfminer falla al abrirlos con la misma excepción que ante un archivo corrupto. Traducir ese fallo a `INVALID_PDF` dejó a la persona sin saber qué hacer. Se distingue con `pypdfium2` (`err_code == FPDF_ERR_PASSWORD`) y se pide la contraseña (`PDF_PASSWORD_REQUIRED`/`PDF_PASSWORD_INCORRECT`). La copia descifrada no es idéntica entre descifrados: la identidad del trabajo se calcula sobre el original.

## Plantilla BCP confirmada con documentos reales

- El nombre del banco vive en el logo, que es imagen: no deja texto extraíble. Un detector que exija esa palabra rechaza estados de cuenta legítimos. La firma estructural (las cinco cabeceras de columna más el formato de cuenta) es más específica y sí está en el texto.
- Las filas de movimiento están separadas 11.2-11.4 puntos, pero la etiqueta del pie y sus importes quedan a 5.2-6.7. Con la tolerancia heredada del legacy, los importes del total y del saldo se perdían o quedaban como filas sin clasificar.
- La etiqueta `TOTAL MOVIMIENTO` aparece al pie de cada página, pero las cifras se imprimen una sola vez, al final, y corresponden al documento completo. Tratar ese total como el de su página hace fallar la reconciliación en todas las páginas.
- Un total ausente no es un total en cero. Compararlo contra la suma real produce una discrepancia inventada; lo correcto es marcarlo como no evaluado.
- Un estado de cuenta real tiene cientos de páginas. Detectar la plantilla antes de recorrerlas evita gastar medio minuto para luego rechazar el documento.
- **Un PDF puede llegar con huecos en blanco y el total impreso no cuadrar por eso.** En un BCP real de 478 páginas, la página 424 traía 16 movimientos en lugar de 35: dos tramos de la tabla estaban vacíos en el propio archivo, sin texto ni imagen, y los abonos impresos superaban la suma de los movimientos. Se descartó una lectura defectuosa: cada importe de las columnas de cargos y abonos de todo el documento tenía su movimiento. `NEEDS_REVIEW` era el resultado correcto. La herramienta de referencia daba los mismos totales sin advertirlo. Para localizar un caso así sirve `Control_Paginas`: una página con muchas menos filas extraídas que las demás. Desde el BCP `0.5.1` (`0.5.2` con los límites corregidos) el worker lo señala solo (`BCP_PAGE_INCOMPLETE`, con la página) y la interfaz lo explica al terminar.
- **El «último saldo» del legacy puede ser el saldo anterior.** El legacy no lee las cifras de las filas `TOTAL_MOVIMIENTO` y `SALDO` de los BCP reales, y su `ultimo_saldo_detectado` acaba siendo el de la fila `SALDO ANTERIOR`. El saldo final del nuevo cuadra con `saldo inicial + abonos − cargos`.
- **Un nombre de producto no siempre dice su familia.** `CONTIAHORRO` y `Cuenta de Ahorros` sí; `CUENTA SIMPLE` (Interbank) no, y es ahorro. Buscar solo `AHORRO`/`CORRIENTE` deja la cuenta sin tipo y fuera del filtro del historial. Los nombres propios de cada banco van en la tabla por banco de `parsing/account_type.py`, nunca en las reglas generales: otro banco podría usar el mismo nombre para otra cosa.
- **Un estado de cuenta puede no declarar su moneda.** El del Banco de la Nación no la nombra en ninguna página, ni en la cabecera ni en el cierre. La celda queda vacía; deducirla del número de cuenta sería adivinar.
- **El titular comparte línea con los rótulos de la cuenta.** Leer la cabecera por líneas de texto pega `CODIGO DE CUENTA MONEDA` al titular, que es lo que hacía el legacy. Hay que separar por posición, y el código de cuenta empieza unos puntos antes que su rótulo: el corte lo marca el dato más a la izquierda del bloque derecho, no el rótulo.

## Plantilla Interbank confirmada con un documento real

- Tras la fila de cierre, el banco añade una página publicitaria y una guía **«Te ayudamos a conocer tu Estado de Cuenta»** que ilustra la plantilla con un ejemplo inventado: trae su propia cabecera, su `EMPEZASTE <MES> CON` y movimientos de otro año con saldos que no cuadran. Leerla mezcla movimientos ajenos con los reales. Se deja de leer en la fila `SALDO CONTABLE AL`, y la guía se descarta además por su título.
- Igual que en BCP, el nombre del banco va en el logo y no deja texto. La cabecera `Fecha | Concepto | Ingresos | Gastos | Saldo Contable` sola no identifica la plantilla —son rótulos corrientes—; lo que la distingue es la fila `EMPEZASTE <MES> CON`.
- El signo del importe (`+120.00`, `-35.50`) dice la columna; la posición es solo el respaldo para un importe sin signo. Un concepto puede traer números (`TIENDA 305`): solo cuenta como importe lo que tiene dos decimales.
- `EMPEZASTE <MES> CON` nombra el mes anterior al periodo (`DEL 30 DE ABRIL AL 31 DE MAYO` empieza con `EMPEZASTE ABRIL`). Es el saldo inicial, no un error de fecha.

## Banco de la Nación: lo que enseñó el documento real

El extractor se escribió **sin muestra**, adivinando la plantilla, y se corrigió el 2026-09-22 con un estado de cuenta real de 144 páginas. Ninguna de las cuatro suposiciones que fallaron era descabellada; todas eran razonables y todas estaban mal. Es el mejor argumento disponible contra escribir un extractor sin documento delante.

- **Un estado de cuenta puede no nombrar a su banco.** El documento real no lo menciona: ni en cabecera, ni en pie, ni en metadatos (el PDF venía reimpreso con `Producer: PDFium`, que borró el original). La detección exigía la marca y valía 0,45 de un mínimo de 0,75, así que **ningún documento real podía superar el umbral**: el techo alcanzable era 0,60. Todos acababan en el respaldo genérico, que además fallaba entero. Si hay que exigir una firma, que sea estructural —aquí `CODIFICACION` sobre `NRO CHEQUE` y `SALDOS DIA`— y no la marca comercial.
- **La fecha no siempre abre la fila.** Aquí la cierra, en la última columna (`DIA`). Un parser que la busca en `words[0]` no ve ni un movimiento. Buscarla por la columna que la cabecera nombra sirve para las dos disposiciones sin tener que elegir.
- **El saldo puede imprimirse una vez por día, no por fila.** De ~280 filas muestreadas, 3 traían saldo. Una reconciliación que exija saldo en cada movimiento no cuadra nunca; la que arrastra y compara solo donde hay saldo impreso cuadra al céntimo. Conviene escribir la continuidad así desde el principio.
- **Rótulo e importe pueden vivir en filas distintas.** El cierre es `TOTAL | TOTAL CARGOS | TOTAL ABONOS | SALDO ACTUAL` en una línea y los valores en la siguiente, alineados bajo cada rótulo. Buscar el importe solo a la derecha de su rótulo, en la misma fila, deja el cierre sin leer y el resultado en `NEEDS_REVIEW` para siempre.
- **Un importe puede llevar relleno de protección**: `*********12,345.67`, como en un cheque, para que nadie le anteponga cifras. Sin quitar los asteriscos no coincide con ningún patrón de importe y la columna parece vacía.
- Para diagnosticar un documento nuevo, la caracterización (`RUN_REAL_STATEMENTS=1`) y los códigos bastan: `BANCO_NACION_HEADER_NOT_FOUND` dice que la cabecera no tiene los rótulos supuestos; `AMOUNT_SIDE_UNKNOWN`, que las columnas de dinero no se distinguen por posición; `OPENING_BALANCE` en `SKIPPED`, que el saldo inicial usa otro rótulo. Nunca hace falta imprimir una fila para saber qué falla.
- **Al explorar una muestra real, no vuelques texto crudo.** Buscando el emisor es fácil imprimir de paso la razón social, la dirección o un saldo. Enmascara los dígitos y exige que una línea aparezca en varias páginas antes de mostrarla: lo que se repite es plantilla, lo que aparece una vez puede ser de alguien.
- Un `SALDO ANTERIOR` en la segunda página no es otro saldo inicial sino el arrastre de la anterior. Tratarlo como apertura haría fallar la reconciliación de cualquier documento de varias páginas; se comprueba como punto de control.
- La numeración de página centrada cae bajo la columna de descripción y se uniría como continuación del último movimiento. Se descarta por su texto (`PAGINA`, `HOJA`) y por la distancia vertical.

## BBVA: impuesto en columna propia y cabecera partida

- **Un impuesto en columna aparte no es decorativo.** El ITF se imprime fuera de `CARGO/ABONO` pero descuenta del saldo igual. Comprobarlo cuesta poco y decide la lectura: sobre el documento real, `saldo = anterior + cargo` cuadra 31 veces y falla 28; `saldo = anterior + cargo - itf` cuadra 59 y falla 0. Ante una columna cuyo papel no está claro, probar las dos ecuaciones y quedarse con la que el documento demuestra, en vez de razonar sobre lo que «debería» ser.
- **Una cabecera partida en varias líneas rompe la búsqueda por frases.** Aquí ocupa tres (`FECHA | FECHA | SALDO`, luego `DESCRIPCION ... CARGO/ABONO ITF`, luego `OPER. | VALOR | CONTABLE`), así que en el texto plano `SALDO CONTABLE` y `FECHA VALOR` **nunca aparecen juntos**. Los rótulos se buscan sueltos.
- **No aprendas las columnas de cualquier fila.** El título del documento —«MOVIMIENTO Y SALDO A LA FECHA»— lleva la palabra `SALDO` a la izquierda de la página; tomarlo por la columna de saldo, que está al otro extremo, deja cero movimientos sin ningún error visible. Aprender solo del bloque de cabecera.
- **Con columnas juntas, el orden es más fiable que la distancia.** `CARGO/ABONO`, `ITF` y `SALDO` están a pocos puntos: el rótulo más cercano se decide por un margen de 3, que cambia con el tamaño de la fuente y hace que un PDF sintético falle donde el real funciona. El orden de las columnas es un hecho de la plantilla; la geometría sirve mejor para **comprobar** el reparto que para decidirlo.
- **La marca del banco puede sobrevivir solo dentro de una URL.** Aquí únicamente en `WWW.BBVABANCOCONTINENTAL.COM`, donde `BBVA` no casa porque no hay frontera de palabra tras `BBVA`.
- **El pie de página puede arrastrar una cifra.** Sin descartarlo se señala como fila con importes sin clasificar y el documento nunca llega a `SUCCEEDED`, aunque todo lo demás cuadre.
- **La cabecera comparte líneas entre dos columnas.** La dirección del titular va a la izquierda y el ejecutivo de cuenta a la derecha, a menos de tres puntos de altura; según la fuente caen en la misma fila visual o no. Una herramienta que lee por líneas pegó «PERU <código>» de la dirección al nombre del ejecutivo y el aviso «BANCA POR INTERNET www…» —y en una página, un saldo— al CCI. Separar por la mitad de la página y cortar cada valor en su rótulo o en la primera palabra que no sea del dato.
- **Un total que mezcla el impuesto no se compara con nada.** El `Resumen` sumaba el ITF a los cargos y lo restaba de los abonos; la herramienta de referencia los deja brutos y el ITF aparte. Las diferencias anotadas a mano en la referencia eran exactamente el ITF de cada lado. Cada total suma su propia columna; la relación entre ellos (`inicial + abonos − cargos − ITF = final`) la comprueba una prueba, no el número.
- **Una continuación puede contener un decimal dentro del concepto.** Antes de tratarlo como un importe financiero, comprobar su columna. La unión exige texto dentro de descripción, una línea contigua y un movimiento anterior en la misma página; nunca se descartan los decimales desconocidos de las columnas monetarias ni se cruzan páginas para silenciar una advertencia.

## Extractor genérico

- Adivinar si un importe es cargo o abono a partir de palabras de la descripción produce estados de cuenta plausibles y equivocados. El rol de una columna se toma de su encabezado o no se toma.
- Un documento puede ser un estado de cuenta y aun así no poder leerse. Sin encabezados reconocibles el resultado correcto es un fallo explícito, no una tabla incompleta.
- Sin conocer la plantilla, la única verificación objetiva es la continuidad del saldo. Sin columna de saldo, el resultado nunca debería presentarse como reconciliado.
- Los títulos y el pie de un documento cruzan varias columnas. Calcular los límites de columna con todas las palabras las funde en una sola; hay que usar únicamente las filas que parecen movimientos.
- La clave de idempotencia debe incluir la versión del extractor. Sin ella, corregir una regla de extracción no reprocesa: el servicio sigue devolviendo la lectura anterior.
- Al generar un PDF de prueba, los rótulos deben caber dentro de su columna: si desbordan, el extractor de tablas devuelve el encabezado entremezclado y la prueba mide un defecto del fixture, no del código.

## Importes y fechas

- Mantener `Decimal` durante parsing, clasificación, sumas y reconciliación. Definir moneda, escala y redondeo.
- Un importe explícito de cero no es un importe ausente. BCP puede imprimir una operación de cero en una sola columna: no cambia el saldo ni los totales, pero sigue siendo una fila válida. Dos columnas cero no demuestran un lado y no deben aceptarse por la misma regla.
- No inferir cargo/abono únicamente por palabras si el layout conserva columnas; las palabras son fallback con advertencia.
- Distinguir separadores `1,234.56` y `1.234,56` por formato detectado. Los casos ambiguos requieren advertencia.
- No convertir cuentas a números: se almacenan y exportan como texto para conservar ceros y guiones.
- El año no debe depender solo del nombre. Considerar periodo del documento y transiciones diciembre/enero.
- **El año del cierre no es el año de cada movimiento.** El estado de cuenta de enero puede traer un movimiento que el banco procesó con fecha 31 de diciembre; con el año del cierre aplicado a todas las fechas `dd/mm` quedaba el 31-12-2026, once meses en el futuro, y el calendario lo mostraba en diciembre del año siguiente. Lo mismo pasaba en la herramienta Python anterior. Una fecha sin año se coloca en el año que la deja más cerca del periodo declarado (`StatementPeriod.place` en `parsing/dates.py`): dentro del periodo la distancia es cero, un movimiento tardío o una fecha valor posterior al cierre quedan a días, y el mismo día de otro año a meses. BCP y Banco de la Nación lo usan desde `0.5.3` y `0.4.1`; BBVA, que no declara periodo, sigue con su regla de la fecha de emisión.

## Excel

- XLSX es un ZIP, pero ser ZIP válido no garantiza semántica correcta.
- Escapar celdas que comiencen con `=`, `+`, `-` o `@` cuando provienen de texto no confiable para evitar formula injection.
- Excel limita filas por hoja. Detectar el límite antes de guardar y dividir o rechazar de forma controlada.
- Los nombres de tablas/hojas deben ser válidos y únicos.
- Escribir a un temporal y publicar el objeto final solo después de cerrar y verificar el workbook.
- Los encabezados de una tabla Excel deben ser cadenas. Si el escritor deja un encabezado no textual, Excel pide reparar el archivo al abrirlo.
- `openpyxl` acepta `Decimal` al escribir, pero al reabrir devuelve `float`. La verificación compara valores numéricos normalizados, nunca identidad de tipo ni bytes.
- Al releer, Excel no distingue una celda vacía de una cadena vacía. La comparación debe aceptar ambas para el mismo texto original.
- `openpyxl` falla si `created` es `None` y sobrescribe `modified` al guardar. Fijar la marca en lugar de intentar eliminarla, y no dejar autor ni ruta del entorno en las propiedades del documento.
- Consecuencia de lo anterior: **el mismo contenido guardado dos veces no da los mismos bytes** si los guardados cruzan el segundo, porque `save_workbook` estampa `modified` con el instante. Comprobado: dos libros idénticos con 1,1 s de por medio tienen checksums distintos. Ninguna prueba puede comparar checksums de XLSX entre dos escrituras independientes; hacerlo produce un fallo intermitente que aparece más o menos una vez de cada cuatro y parece un problema de orden entre pruebas. Comparar qué artefactos se publican, no sus bytes. El diseño no lo necesita: la publicación atómica verifica reabriendo el archivo, no comparando bytes.
- Una hoja sin filas no debe declarar una tabla de solo encabezado; usar autofiltro y conservar la hoja visible.

## CSV

- Un CSV sin BOM se abre con acentos rotos en Excel bajo configuración regional española; `utf-8-sig` y fin de línea `

` evitan pasos manuales al usuario.
- El entrecomillado no protege contra fórmulas: una celda que empiece con `=`, `+`, `-` o `@` sigue ejecutándose al abrir el CSV. La neutralización debe venir del contrato, no del escritor.
- Delimitador y separador decimal son una sola decisión: con `.` decimal, el delimitador debe ser `,` y el archivo no debe formatearse según configuración regional.
- El nombre del archivo no debe derivarse del documento original. Un identificador validado evita rutas, caracteres de escape y nombres sensibles.
- Publicar varios archivos como paquete exige escribir y verificar todos antes de mover cualquiera; de otro modo un fallo tardío deja una salida incompleta que parece válida.

## Multi-tenant y artefactos

- Una clave de objeto globalmente única no puede derivarse solo del contenido: dos organizaciones que suben el mismo documento producen el mismo identificador en el worker y chocan al insertar. La clave debe llevar la organización.
- Un objeto ausente o con una clave de una versión anterior no es un error del servidor: devolver 404 con código, no 500 con `ENOENT`.
- La respuesta pública no debe exponer la clave del objeto. Un nombre de descarga derivado del trabajo y del tipo evita filtrar el nombre del documento original.
- Mientras los resultados vivan en el disco del worker, su directorio de artefactos es estado permanente: cambiarlo deja sin descarga a todos los trabajos ya publicados.
- El directorio de un trabajo del worker se identifica por contenido y lo comparten todas las personas que suben el mismo PDF. Si un artefacto incluye algo de quien lo subió —el nombre del PDF en el `Resumen`—, ese dato tiene que entrar en la identidad del trabajo; si no, la segunda persona recibe el libro con el nombre que eligió la primera.
- Cada código de error del contrato necesita su mensaje en el cliente. Uno sin traducir aparece como "error inesperado" y oculta la causa real al usuario.

## Navegador

- Mostrar `File.name` en la carga no conserva el nombre después de navegar. El contrato debe transportarlo hasta detalle e historial; no reemplazarlo con números inventados. El nombre es texto privado del dueño, no una ruta ni una clave de almacenamiento.
- Un `onDrop` que solo apaga el resaltado no selecciona el archivo. Cancelar la acción nativa y actualizar el campo de React Hook Form con el `FileList` recibido, ejecutando la misma validación que en el selector.
- El `filename` de una cabecera multipart puede llegar interpretado como Latin-1. Enviar además el nombre como campo de texto UTF-8 evita romper acentos; comprobarlo con una carga real contra la API, no solo con objetos `File` simulados.
- Un nombre largo puede desbordar un encabezado flex aunque tenga `overflow-wrap`. El contenedor también necesita `min-width: 0`; en móvil, separar el estado del bloque de nombre para que no lo comprima.

- Revocar la URL del blob en el mismo tick del `click()` cancela la descarga antes de que el navegador la inicie. Liberar en el siguiente tick.
- Cada botón de descarga necesita mostrar su propio error. El mensaje de las descargas secundarias no cubre el botón principal de Excel: cada uno tiene una mutación independiente.
- `NEEDS_REVIEW` puede deberse solo a una advertencia. No afirmar un descuadre financiero sin una comprobación fallida; conservar la revisión aunque las comprobaciones disponibles pasen.
- Con CORS, el navegador solo lee las cabeceras expuestas explícitamente. Un nombre de archivo tomado de `Content-Disposition` necesita `Access-Control-Expose-Headers` o un valor de respaldo.
- Un localizador por texto puede coincidir además con el nombre accesible de un botón que lo contiene. Preferir roles y nombres accesibles.
- Si la página de origen pinta un instante el mismo texto que la de destino antes de navegar, `findByText` lo encuentra en la de origen y la aserción siguiente ve un nodo ya desmontado: falla con «`toBeInTheDocument`» aunque el texto sí aparezca después. No se arregla con más tiempo de espera; se ancla primero en algo que solo existe en la página de destino. Pasó en `upload-page.test.tsx`, ~1 de cada 3 corridas.
- En Windows, `curl` desde Git Bash envía los argumentos `-d` en la página de códigos ANSI: un acento llega como byte inválido y la API lo guarda como carácter de reemplazo. Al probar a mano, mandar el cuerpo desde un archivo UTF-8 con `--data-binary @archivo`.

## Herramientas y entorno

- Una dependencia de desarrollo puede romper la verificación de tipos sin tocar el código: instalar `pandas` trajo `numpy`, cuyos stubs exigen Python 3.12, y mypy abortaba siguiendo la cadena `pdfplumber` -> `PIL` -> `numpy`.
- Para dependencias transitivas que el núcleo no usa, un stub local opaco en `typings/` es preferible a subir la versión objetivo de mypy o a apagar el chequeo del módulo.
- Los scripts legacy se ejecutan tal como están en las pruebas de caracterización. Copiarlos o adaptarlos dentro del proyecto nuevo elimina el valor de la comparación.
- Un archivo de preparación de pruebas que fija variables de entorno debe respetar las que ya vengan definidas; de lo contrario una corrida contra base real se conecta a la ficticia.
- Los puertos de desarrollo habituales (5173, 8000, 3000) pueden estar ocupados por otro proyecto de la misma máquina. Reutilizar un servidor ajeno hace que la prueba mida otra aplicación: fijar puerto propio y no reutilizar.
- Docker Desktop no arranca sin virtualización habilitada en la BIOS ni sin WSL. Conviene tener una ruta alternativa para levantar la base en desarrollo.
- En Windows, un escritor que falla a mitad puede dejar el archivo abierto. Borrar el temporal en el `finally` debe ser un intento, no una obligación: de lo contrario el `PermissionError` de limpieza reemplaza al error real.
- En Windows, `multiprocessing` arranca cada hijo re-importando el `__main__` del padre. Un script pasado por la entrada estándar no tiene archivo que re-importar y el pool muere con `OSError: [Errno 22] '<stdin>'`: los guiones que usen procesos deben vivir en un archivo y llevar guarda `if __name__ == "__main__":`. Los puntos de entrada reales son seguros por motivos distintos — `python -m uvicorn` porque el hijo detecta un nombre acabado en `.__main__` y sale antes, y un `.exe` porque se omite del todo — pero conviene comprobarlo antes de confiar en un pool dentro de un servidor.
- Un pool de procesos no se prueba comprobando que el resultado es correcto: eso también ocurre si se cayó al camino secuencial. Confirmar que los tramos se leyeron en PID distintos del padre.
- Observación abierta, sin corrección: `test_preserves_existing_target_unless_overwrite_is_explicit` falló **una vez**, en la primera corrida completa con los estados de cuenta reales después de introducir la lectura repartida, y no volvió a reproducirse en diez corridas posteriores. La sospecha es un bloqueo transitorio de Windows sobre el destino durante el `os.replace`, con ocho procesos escribiendo a la vez en el mismo directorio. No se ha tocado el publicador atómico: sin confirmar el mecanismo, añadirle reintentos sería justo la conjetura que este proyecto evita. Si reaparece, capturar la traza completa antes de decidir.

## Asincronía y operación

- No ejecutar extracción pesada en el event loop de NestJS o FastAPI. Esta regla ya estaba escrita aquí y el worker la incumplía igualmente: un manejador `async def` que llama al trabajo bloqueante en directo no parece sospechoso al leerlo. Medido contra el servicio en marcha, `/health` tardó 39 s en contestar durante un documento, frente a 1,5 ms en reposo. Aislar el trabajo en una función y ejecutarlo con `run_in_threadpool`.
- Una prueba de que «el servicio responde durante el trabajo» no puede limitarse a comprobar que la respuesta llega: con el bucle bloqueado también llega, solo que después. Hay que afirmar que llegó **mientras la otra petición seguía pendiente**, y que el trabajo simulado se libere solo, para que un fallo sea un fallo y no un cuelgue.
- Sacar el trabajo del bucle habilita concurrencia real: si cada documento ya reparte páginas entre procesos, hace falta un tope de documentos simultáneos o la máquina acaba con más procesos que núcleos.
- BullMQ y Celery no son consumidores intercambiables. Celery/Redis pertenece al worker en esta arquitectura.
- Toda tarea debe ser idempotente: un reintento no crea cobros, filas, trabajos ni objetos duplicados.
- Redis no es la fuente de verdad del estado público; PostgreSQL conserva el historial auditable.
- No mostrar errores internos, rutas, stack traces o secretos al frontend.

## Base de datos

- **`@updatedAt` de Prisma no lleva `DEFAULT` en la base.** Una migración escrita a mano con `DEFAULT CURRENT_TIMESTAMP` en esa columna deja deriva (`prisma migrate diff` la detecta). Crear la columna sin valor por defecto y pasar `CURRENT_TIMESTAMP` en los `INSERT` de la semilla. Comprobar siempre con `prisma migrate diff --from-url … --to-schema-datamodel …` tras aplicar una migración manual.
- **`pg_restore --clean` solo borra lo que está en el respaldo.** Para volver a un respaldo tomado antes de una migración que creó tablas, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` y después restaurar; si no, las tablas nuevas sobreviven y la migración siguiente falla.
- **Pasar de enum a catálogo sin perder datos:** añadir la columna de código como nula, copiarla con `"role"::text`, ponerla `NOT NULL`, borrar la columna y el tipo, y solo entonces la clave foránea. Todo en una transacción.

- La paginación por desplazamiento repite o salta filas cuando llegan registros nuevos mientras se navega. Para historiales usar clave compuesta (fecha, id) y un cursor opaco.

- No guardar PDF/XLSX en `bytea`; almacenar referencias opacas a objetos privados.
- No usar `float`, `double precision` ni `money` para importes; usar `numeric` con escala documentada.
- No consultar entidades tenant únicamente por `id`; incluir siempre `organization_id` y restricciones que eviten asociaciones cruzadas.
- No usar Redis como fuente de verdad ni permitir que el worker modifique PostgreSQL directamente.
- No convertir `jsonb` en un esquema sin validación; cada payload flexible debe estar versionado y limitado.
- No usar `prisma db push` en producción ni editar migraciones ya aplicadas.
- No almacenar texto crudo, números de cuenta completos o movimientos individuales sin una necesidad y política de retención aprobadas.

## Despliegue y dependencias

- **Desde FastAPI 0.15x un campo de formulario `bool` ausente vale `False`** (semántica de casilla HTML sin marcar), aunque se declare `= True`. La API no envía `export_xlsx` ni `export_csv`, así que la imagen de Railway —que resuelve las dependencias al construir y sacó 0.156— rechazaba todo trabajo con `INVALID_JOB_OPTIONS`; en local, con 0.141, no aparecía. Se leen como texto con el valor por defecto en el código. Lección: las versiones de la imagen no son las del entorno local; antes de desplegar, correr la suite del worker en un entorno con las dependencias recién resueltas (`py -3.12 -m venv …; pip install ".[pdf,excel,api]"`). Un archivo de bloqueo evitaría la deriva.
- **`curl` sin `Accept: text/html` recibe 404 en `/`**: el respaldo del frontend solo entrega la página a un navegador. No es una caída.
- **`railway up` no se dispara con un push**: los servicios se suben a mano. Un despliegue puede arrastrar cambios de días anteriores que nunca se subieron; revisarlos antes.

## Entorno Windows

- **PowerShell 5.1 convierte en error cualquier línea de stderr de un ejecutable** cuando `$ErrorActionPreference = 'Stop'`, aunque termine bien. `pg_ctl` avisa en stderr de un PID huérfano tras un apagado brusco y arranca igual; `local-postgres.ps1` abortaba por ese aviso. Decidir por `$LASTEXITCODE`, no por stderr.
- **PowerShell 5.1 lee como ANSI un `.ps1` en UTF-8 sin BOM**: `local-postgres.ps1` imprime «DespuÃ©s». Es cosmético y anterior; no se cambió la codificación del archivo.
- **La consola de Windows usa cp1252**: un script de Python que imprime «≤» u otros símbolos falla con `UnicodeEncodeError`. Ejecutarlo con `python -X utf8` (con `-I`, `PYTHONIOENCODING` se ignora).
- **Con la API en marcha, Windows bloquea el motor de Prisma** y `prisma generate` falla tras una migración: detener los servicios (`.\ejecutar.ps1 -Detener`), generar y volver a levantar.
- **`frontend/.env.local` apunta el proxy a producción.** Para probar contra la API local sin tocar el archivo: `VITE_API_PROXY_TARGET=http://127.0.0.1:3000 npx vite` (las variables del proceso ganan a `.env.local` en `loadEnv`).

## Frontend

- **Un texto con prefijo para lectores de pantalla no empieza por lo que se ve.** Los avisos llevan `<span class="sr-only">Atención: </span>` antes del título: en Playwright, `getByText(/^Se reemplazó/)` no coincide; usar la expresión sin ancla o el rol.
- **Al probar el reemplazo por cupo con documentos reales, repetir un PDF que sigue guardado lo reutiliza** y no reemplaza nada, que es lo correcto. Una prueba repetible prepara antes la cuenta en un estado conocido.
- **`disabled:opacity-50` del `Input` base pisa el `opacity-0` del selector de archivo oculto**: al deshabilitar la carga aparecía el texto nativo «No file chosen». Añadir `disabled:opacity-0` al campo que debe seguir invisible.
- **Una mutación que reintenta los 5xx tarda unos segundos en mostrar el error** (backoff de TanStack Query): en las pruebas, `findBy…` con `timeout` mayor y un `timeout` de la prueba acorde.
- **`eslint-plugin-react-refresh` no admite exportar componentes y funciones del mismo archivo**: las funciones auxiliares van a un `.ts` aparte (`lib/support-report.ts`).

- **Cada exportador rotula sus CSV a su manera, y un rótulo desconocido no falla: da cero.** El Centro Financiero y el Calendario buscaban `Cargo`/`Abono` y `Fecha proceso`/`Fecha`; el BBVA publica `Cargo/Abono` con signo y `Fecha oper.`, así que un estado de cuenta del BBVA se veía **sin un solo movimiento** y sin error. Al añadir un exportador, añadir sus cabeceras reales a `statement-from-csv.test.ts`.
- **El ITF del BBVA ya está dentro de los totales de su `Resumen`.** El banco no imprime totales de cargos y abonos; los calcula el worker con el ITF de cada fila restado (abonos netos, cargos con su impuesto). La interfaz muestra el ITF como movimiento aparte, así que suma entradas y salidas desde las filas: sumar además el `Total ITF` lo contaba dos veces y el periodo no cuadraba (5.75 en el documento real). Las pruebas no lo vieron porque el CSV de ejemplo suponía totales sin ITF: **los fixtures del frontend se copian de lo que publica el worker, no de lo que uno espera**.
- **`Tipo de fila` no se escribía igual en todos los bancos.** Hasta ADR-0015, BCP publicaba `MOVEMENT` y `PREVIOUS_BALANCE`, y BBVA `MOVIMIENTO` y `SALDO_ANTERIOR`. Hoy los dos usan los rótulos en español, pero los Excel BCP ya publicados siguen en inglés. Comparar con un único valor deja fuera todos los movimientos de esos libros sin ningún error: se aceptan los dos conjuntos y la prueba fija que el saldo anterior nunca entra como movimiento.
- **Soles y dólares no se suman.** Cada estado de cuenta lleva su moneda (columna `Moneda` del `Resumen`) y las vistas consolidan una sola a la vez. Un documento sin moneda declarada se trata como soles.
- No guardar tokens sensibles ni resultados financieros completos en almacenamiento persistente del navegador sin una decisión de seguridad.
- Cancelar polling al llegar a un estado terminal y usar backoff.
- `SUCCEEDED` y `NEEDS_REVIEW` son experiencias distintas.
- Los componentes shadcn se poseen localmente; modificar con intención y preservar accesibilidad de Radix.
