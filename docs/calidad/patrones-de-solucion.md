# Patrones de solución y autoaprendizaje

## Protocolo para resolver un bug

1. Describir el síntoma sin copiar datos sensibles.
2. Reducirlo a un fixture sintético o anonimizado.
3. Escribir una prueba que falle por la causa correcta.
4. Localizar la capa responsable; evitar parches en API/UI para errores del extractor.
5. Corregir el caso general más pequeño.
6. Ejecutar regresión del extractor y verificar invariantes financieras.
7. Registrar la lección reutilizable en este documento o en `fallos-y-trampas.md`.
8. Añadir una entrada breve a la bitácora.

Una corrección manual sin prueba es temporal y debe quedar como deuda explícita.

## Pruebas de caracterización

Antes de mover lógica legacy, congelar resultados seguros por plantilla:

- banco/versión detectada;
- cantidad de páginas y filas por página;
- fechas mínima y máxima;
- sumas de cargos y abonos;
- saldos inicial/final cuando existan;
- advertencias esperadas;
- hash de una representación canónica sin PII.

Comparar semántica, no bytes del XLSX: metadata y orden interno de un ZIP pueden variar.

La comparación se ejecuta contra el script legacy real, cargado por ruta relativa y sin modificarlo, sobre el mismo documento sintético. Si el script o sus dependencias no están disponibles, la prueba se salta con el motivo explícito; nunca se sustituye por una copia del legacy dentro del proyecto nuevo, porque entonces dejaría de caracterizar nada.

## Un fixture sintético puede halagar al código

El PDF sintético escribía el nombre del banco como texto, algo que el documento real no hace porque lo lleva en el logo. Las pruebas pasaban y la realidad fallaba. Cuando una señal proviene del layout, el fixture debe reproducir también el caso en que esa señal falta.

Los documentos reales no se versionan, pero sí puede versionarse una prueba que los use cuando estén presentes en la máquina y se active con una variable de entorno. Sus aserciones comparan conteos y sumas entre sí, nunca imprimen contenido.

## Demostrar en vez de adivinar

Un diccionario de sinónimos crece con cada banco y nunca termina. Cuando el propio documento contiene una relación verificable, conviene resolverla en lugar de nombrarla: de todas las formas de asignar las columnas numéricas a cargo, abono y saldo, solo una hace que el saldo avance correctamente durante decenas de filas. Esa lectura queda demostrada por el documento, no supuesta por el programa, y funciona con cualquier idioma o rotulación.

La regla general: preferir una comprobación aritmética sobre una heurística de vocabulario, y cuando ninguna comprobación sea posible, decirlo en vez de entregar un resultado plausible.

## Acelerar sin cambiar el resultado

Antes de optimizar, medir dónde se va el tiempo. En el estado de cuenta de 425 páginas el perfilado señaló el 95 % en `extract_words` convirtiendo 1,5 millones de objetos de carácter: no había nada que afinar dentro de esa conversión, y cualquier cambio en el parseo habría sido irrelevante.

Cuando el trabajo caro se descompone en unidades independientes —aquí, páginas—, repartirlo entre procesos es la única vía real. La condición que lo hace aceptable es que el resultado sea **idéntico**, no equivalente: los tramos se reordenan por número de página y una prueba compara filas, métricas y sonda entre el camino secuencial y el repartido. Sin esa prueba, un acelerón es un cambio de comportamiento no medido.

Los umbrales se justifican con la medición que los motiva, no con una intuición: arrancar el pool cuesta 0,37 s, así que por debajo de 24 páginas se lee en el proceso actual, y un pool compartido que ahorraría un 3 % no compensa el estado global que introduce. Cuando un número aparece en el código, el comentario debe decir de qué medición sale.

Y una optimización que falla no puede tumbar la petición: si el reparto no es posible, se lee en este mismo proceso. Conviene que el camino lento sea el mismo código —«un tramo que cubre todo el documento»— para que no haya dos caminos capaces de divergir.

## Una corrección de rendimiento puede destapar una de disponibilidad

Al medir el tiempo extremo a extremo apareció algo peor que la lentitud: el manejador `async def` ejecutaba el trabajo bloqueante en directo y dejaba al servicio entero sin responder mientras duraba. La regla estaba escrita desde el principio en `fallos-y-trampas.md`; el código la incumplía porque un `await` de subida seguido de una llamada síncrona no se lee como un bloqueo.

De ahí dos hábitos: medir la disponibilidad, no solo la duración —preguntar por `/health` mientras el servicio trabaja—, y escribir la prueba de forma que el fallo sea un fallo. Comprobar que la respuesta llega no basta: con el bucle bloqueado también llega, más tarde. Hay que afirmar que llegó mientras la otra petición seguía pendiente.

## Strategy para bancos y versiones

Evitar un `if/elif` creciente. Cada extractor debe declarar señales de detección, layouts compatibles, versión y razones de rechazo. Un registro selecciona la mejor estrategia solo si supera un umbral; empates o baja confianza producen `NEEDS_REVIEW`.

## Pipeline puro con adaptadores

Separar:

```text
ingesta → saneamiento → detección → extracción → normalización
        → validación/reconciliación → exportación → publicación
```

Las etapas centrales operan con modelos de dominio. FastAPI, Celery, Redis, S3 y Excel son adaptadores en los bordes.

## Resultado rico, no solo filas

Cada ejecución devuelve:

- datos extraídos;
- versión de estrategia;
- confianza/evidencia de detección;
- métricas por página;
- invariantes evaluadas;
- advertencias tipadas;
- errores tipados y sanitizables.

Esto permite depurar cambios bancarios sin imprimir contenido del documento.

## Fixture PDF como contrato ejecutable

Un extractor por coordenadas debe probarse con un PDF sintético generado, no solo con listas de palabras fabricadas. La misma prueba debe atravesar saneamiento, lectura, detección, parseo y reconciliación. Además se renderiza el fixture al cambiar su layout: una extracción correcta no detecta por sí sola cabeceras solapadas u otros defectos visuales.

## Publicación verificada de artefactos

Un artefacto financiero se publica en tres pasos separados: plan validado, escritura a un temporal del mismo volumen y reapertura semántica antes de mover el archivo al destino.

El verificador compara hojas, forma, encabezados y valores tipados contra el mismo plan que produjo el archivo; nunca compara bytes ni confía en que la librería escribió lo que se le pidió. Un fallo elimina el temporal y conserva el destino anterior. La librería de escritura vive en un módulo adaptador aparte para que el contrato de salida siga siendo importable sin ella.

## Idempotencia

Usar una clave derivada de organización, hash seguro del objeto, versión de extractor y opciones. Repetir la misma solicitud devuelve el trabajo existente o crea un intento relacionado según la política; nunca sobrescribe silenciosamente un resultado publicado.

## Aprendizaje del proyecto

Cuando usuario, prueba o producción revele una regla nueva:

1. registrar evidencia mínima y anonimizada;
2. clasificarla como bug, nueva plantilla o regla de negocio;
3. convertirla en fixture/prueba;
4. actualizar la estrategia y su versión;
5. documentar impacto y decisión;
6. evaluar reprocesamiento de trabajos afectados.

La documentación no reemplaza pruebas. Las pruebas no reemplazan la bitácora de decisiones.
