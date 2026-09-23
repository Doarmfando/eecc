# Fallos y trampas

## Datos y seguridad

- Los documentos contienen información financiera. Nunca incluir su texto, nombres, cuentas o importes en logs, excepciones públicas, telemetría o fixtures.
- Extensión y `Content-Type` no prueban que un archivo sea PDF. Validar firma, estructura, límites y rechazo seguro.
- Proteger contra archivos enormes, PDFs cifrados, page bombs, ZIP bombs en XLSX y tiempos de procesamiento ilimitados.
- Los nombres originales no deben convertirse directamente en claves S3 ni rutas temporales.

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

## Plantilla BCP confirmada con documentos reales

- El nombre del banco vive en el logo, que es imagen: no deja texto extraíble. Un detector que exija esa palabra rechaza estados de cuenta legítimos. La firma estructural (las cinco cabeceras de columna más el formato de cuenta) es más específica y sí está en el texto.
- Las filas de movimiento están separadas 11.2-11.4 puntos, pero la etiqueta del pie y sus importes quedan a 5.2-6.7. Con la tolerancia heredada del legacy, los importes del total y del saldo se perdían o quedaban como filas sin clasificar.
- La etiqueta `TOTAL MOVIMIENTO` aparece al pie de cada página, pero las cifras se imprimen una sola vez, al final, y corresponden al documento completo. Tratar ese total como el de su página hace fallar la reconciliación en todas las páginas.
- Un total ausente no es un total en cero. Compararlo contra la suma real produce una discrepancia inventada; lo correcto es marcarlo como no evaluado.
- Un estado de cuenta real tiene cientos de páginas. Detectar la plantilla antes de recorrerlas evita gastar medio minuto para luego rechazar el documento.

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

## Extractor genérico

- Adivinar si un importe es cargo o abono a partir de palabras de la descripción produce estados de cuenta plausibles y equivocados. El rol de una columna se toma de su encabezado o no se toma.
- Un documento puede ser un estado de cuenta y aun así no poder leerse. Sin encabezados reconocibles el resultado correcto es un fallo explícito, no una tabla incompleta.
- Sin conocer la plantilla, la única verificación objetiva es la continuidad del saldo. Sin columna de saldo, el resultado nunca debería presentarse como reconciliado.
- Los títulos y el pie de un documento cruzan varias columnas. Calcular los límites de columna con todas las palabras las funde en una sola; hay que usar únicamente las filas que parecen movimientos.
- La clave de idempotencia debe incluir la versión del extractor. Sin ella, corregir una regla de extracción no reprocesa: el servicio sigue devolviendo la lectura anterior.
- Al generar un PDF de prueba, los rótulos deben caber dentro de su columna: si desbordan, el extractor de tablas devuelve el encabezado entremezclado y la prueba mide un defecto del fixture, no del código.

## Importes y fechas

- Mantener `Decimal` durante parsing, clasificación, sumas y reconciliación. Definir moneda, escala y redondeo.
- No inferir cargo/abono únicamente por palabras si el layout conserva columnas; las palabras son fallback con advertencia.
- Distinguir separadores `1,234.56` y `1.234,56` por formato detectado. Los casos ambiguos requieren advertencia.
- No convertir cuentas a números: se almacenan y exportan como texto para conservar ceros y guiones.
- El año no debe depender solo del nombre. Considerar periodo del documento y transiciones diciembre/enero.

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
- Cada código de error del contrato necesita su mensaje en el cliente. Uno sin traducir aparece como "error inesperado" y oculta la causa real al usuario.

## Navegador

- Revocar la URL del blob en el mismo tick del `click()` cancela la descarga antes de que el navegador la inicie. Liberar en el siguiente tick.
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

- La paginación por desplazamiento repite o salta filas cuando llegan registros nuevos mientras se navega. Para historiales usar clave compuesta (fecha, id) y un cursor opaco.

- No guardar PDF/XLSX en `bytea`; almacenar referencias opacas a objetos privados.
- No usar `float`, `double precision` ni `money` para importes; usar `numeric` con escala documentada.
- No consultar entidades tenant únicamente por `id`; incluir siempre `organization_id` y restricciones que eviten asociaciones cruzadas.
- No usar Redis como fuente de verdad ni permitir que el worker modifique PostgreSQL directamente.
- No convertir `jsonb` en un esquema sin validación; cada payload flexible debe estar versionado y limitado.
- No usar `prisma db push` en producción ni editar migraciones ya aplicadas.
- No almacenar texto crudo, números de cuenta completos o movimientos individuales sin una necesidad y política de retención aprobadas.

## Frontend

- No guardar tokens sensibles ni resultados financieros completos en almacenamiento persistente del navegador sin una decisión de seguridad.
- Cancelar polling al llegar a un estado terminal y usar backoff.
- `SUCCEEDED` y `NEEDS_REVIEW` son experiencias distintas.
- Los componentes shadcn se poseen localmente; modificar con intención y preservar accesibilidad de Radix.
