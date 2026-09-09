# ADR-0007: Cupo de documentos por persona, con borrado de los antiguos

- Estado: Aceptada
- Fecha: 2026-09-08

## Contexto

Nada caducaba. Cada estado de cuenta procesado dejaba tres rastros permanentes: el PDF de origen en el almacenamiento de objetos, sus XLSX/CSV en el disco del worker, y las filas del trabajo en PostgreSQL. `Organization.retentionDays`, `Statement.retainUntil` y `Artifact.retainUntil` existían en el esquema desde [`ADR-0002`](ADR-0002-postgresql-prisma-y-minimizacion-financiera.md) y ningún código los aplicaba.

Al retirar el modo sin persistencia ([`ADR-0006`](ADR-0006-postgresql-como-unica-persistencia.md)) esto pasó de ser una deuda a un problema: ya no había ninguna vía para trabajar sin acumular archivos. Y el destino previsto es un plan de Railway con almacenamiento limitado.

El coste real no está donde parece. Las filas de PostgreSQL son pequeñas —el esquema no guarda movimientos, solo identificadores, estados y conteos—; lo que crece sin freno son **los archivos en disco**: un estado de cuenta de 400 páginas ocupa megabytes entre el PDF y sus derivados.

## Decisión

Conservar como máximo **`RETAINED_STATEMENTS_PER_USER` documentos por persona**, con 3 por defecto. Al superarlo, los más antiguos se borran enteros: PDF de origen, artefactos del worker y fila del documento.

Se aplica **después** de registrar cada documento nuevo, dentro de la misma petición. No hay tarea programada.

El cupo es por persona y no por organización: así la actividad de alguien no borra el trabajo reciente de un compañero. Un documento subido con credencial de servicio tiene `uploadedById` nulo y forma su propio grupo.

Se borra el documento completo y no solo sus archivos. Un historial que enumera trabajos cuyos resultados ya no se pueden descargar confunde más de lo que informa.

Antes de pedir al worker que descarte un trabajo se comprueba que ningún otro documento lo referencie. El identificador del worker se deriva del contenido, así que dos organizaciones que subieron el mismo archivo comparten sus artefactos; borrarlos dejaría a la otra sin poder descargar lo suyo.

## Alternativas consideradas

- **Caducidad por tiempo (`retentionDays`), que es lo que el esquema preveía**: más natural para una política de privacidad, pero no acota el espacio —alguien que sube cien documentos en un día los conserva todos— y exige un proceso periódico. El cupo da una cota dura y se ejecuta sin planificador. La caducidad por tiempo sigue teniendo sentido y puede sumarse después; no se opone a esto.
- **No guardar ningún archivo y devolver los resultados en la respuesta**: es lo que hacía el modo sin persistencia, retirado en `ADR-0006` porque dejaba el producto sin inicio de sesión. Además rompe la descarga posterior, que es como funciona la interfaz.
- **Una tarea programada de limpieza**: separa la limpieza del camino de subida, pero añade un planificador y el fallo se vuelve silencioso. Hacerlo tras cada alta mantiene la cota siempre satisfecha y el registro a la vista.
- **Borrar solo los archivos y conservar la fila**: el historial mostraría trabajos inservibles.
- **Cupo por organización**: más simple de razonar sobre el espacio total, pero deja que una persona activa borre el trabajo de otra.

## Consecuencias

- El espacio queda acotado: como mucho `personas × 3` documentos. Con el valor por defecto, diez personas ocupan treinta.
- **Se pierden documentos sin avisar.** Quien suba un cuarto documento perderá el primero, y la interfaz todavía no lo advierte. Es la consecuencia más incómoda de esta decisión.
- La limpieza corre dentro de la petición de subida, así que la alarga un poco. Es un borrado de pocos archivos y ocurre después de responder al trabajo pesado.
- Si la limpieza falla, no se propaga: el documento nuevo ya está guardado y la próxima subida vuelve a intentar retirar el residuo. Un fallo persistente queda en el registro, no en la respuesta.
- El `DELETE /internal/statements/{job_id}` del worker, que se añadió para el modo sin persistencia y se quedó sin llamador, vuelve a tener uso.
- La retención por tiempo sigue sin implementarse. Un documento dentro del cupo se conserva indefinidamente si esa persona no sube más.

## Criterio de revisión

Revisar si aparece una obligación de conservación —contable o legal— que exija guardar más tiempo del que el cupo permite, o si al contrario hace falta una caducidad por tiempo para cumplir una política de privacidad. Revisar también cuando se conecte S3: con almacenamiento elástico, la cota deja de ser la restricción y pasa a serlo el coste.
