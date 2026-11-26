# ADR-0018: Cobro por páginas acumuladas al mes, prueba única y tope técnico separado del de cobro

- Estado: Aceptada
- Fecha: 2026-11-17
- Amplía: [ADR-0016](ADR-0016-roles-y-membresias-como-catalogo.md) (crea el catálogo de planes
  y usa `max_pages_per_document` a la vez como seguridad y como cobro) y
  [ADR-0007](ADR-0007-cupo-de-documentos-por-persona.md) (el cupo de documentos guardados
  sigue siendo independiente de esto).

## Contexto

El responsable del producto va a monetizar el servicio (cobro manual por Yape, todavía en
pruebas) y pidió revisar el modelo de planes antes de fijar precios. Al revisarlo con datos
reales de la base y de documentos de prueba aparecieron dos problemas:

1. **`max_pages_per_document` cumplía dos papeles a la vez.** Para Básica era un límite de
   negocio (15 páginas por PDF) y a la vez una protección técnica. Para Atlas era `NULL`
   ("sin límite"), lo que en la práctica significa que el worker intenta extraer **cualquier**
   cantidad de páginas. Con la tasa observada en producción (≈0,03 s/página en un BCP real de
   457-478 páginas), un PDF de un millón de páginas ocuparía el worker unas 8 horas, y
   `EECC_WORKER_MAX_CONCURRENT_DOCUMENTS=2` significa que la mitad de la capacidad del worker
   quedaría secuestrada por un solo documento, probablemente ni siquiera un estado de cuenta
   real: el propio README dice que esto no es un conversor genérico de PDF.
2. **El tope por documento no acota el consumo real.** Alguien puede subir varios PDF
   pequeños y nunca tocar el límite de ninguno, aunque el costo de cómputo y almacenamiento
   sea el mismo que un solo documento grande. Cobrar por tamaño máximo de un archivo no
   refleja el costo real, que es la suma de páginas procesadas.

Los documentos reales disponibles (seis de la carpeta de pruebas de octubre más dos nuevos)
muestran una distribución **bimodal**: cinco de siete cuentas individuales están entre 1 y 10
páginas; las únicas excepciones (Banco de la Nación 132, dos BCP de 457 y 478) son cuentas de
alto volumen, no personas. Esto valida separar "cuenta normal" de "hay que cotizar" en un
punto entre 20 y 130 páginas, donde no hay ningún documento real.

## Decisión

### Separar el tope técnico del tope de cobro

`membership_plans` pasa a tener dos columnas con responsabilidades distintas:

| Columna | Qué protege | Valor hoy |
| --- | --- | --- |
| `max_pages_per_document` | Al **worker**, de un archivo absurdo. Igual para todos los planes. | `1000` en los cuatro planes |
| `monthly_page_quota` | Al **negocio**, decide cuánto se cobra. Nulo: sin tope fijo, se cotiza. | Gratuito 3, Básica 10, Especial 20, Atlas `NULL` |

Mil páginas sigue siendo "sin límite práctico" para cualquier estado de cuenta real (el más
grande visto nunca pasó de 478), pero reactiva el rechazo rápido por pdfium
(`PDF_PAGE_LIMIT_EXCEEDED`, décimas de segundo) que antes solo protegía a Básica.

### Cobro por acumulado de 30 días, no por archivo

`monthly_page_quota` suma **todas** las páginas que una persona procesa en una ventana móvil
de 30 días, calculada al subir (`StatementUsageService.pagesUsedInCurrentPeriod`), sin tarea
programada, igual que el cupo de documentos de ADR-0007 se aplica dentro de la misma
petición. El número que se envía al worker como `max_pages` ya no es el tope del plan: es
`monthly_page_quota − usado`, así que un documento que cabe en lo que queda del mes se
procesa, y uno que no, se rechaza con el mismo `PDF_PAGE_LIMIT_EXCEEDED` de siempre, pero con
el número correcto. Si ya no queda nada, se rechaza antes de llamar al worker
(`MONTHLY_PAGE_QUOTA_EXCEEDED`), sin gastar cómputo.

Repetir un PDF ya subido reutiliza el trabajo (como siempre) y no pasa por esta cuenta: no
se cobra dos veces por el mismo documento.

### Prueba gratuita de una sola vez

Nace el plan **Gratuito**: una conversión de prueba (hasta 3 páginas), que **no se renueva
cada mes**. `membership_plans.trial_one_time` lo marca y
`organization_memberships.trial_used_at` registra cuándo se gastó, por persona. Se decidió
así y no con un cupo mensual normal porque, si el gratuito se recargara cada mes, cubriría a
buena parte del Perfil de sueldo mínimo (2-6 páginas/mes estimadas) sin que nadie pague nunca.

### Nuevo plan Especial, entre Básica y Atlas

| Plan | Documentos guardados | Páginas/mes | Vistas |
| --- | --- | --- | --- |
| Gratuito | 1 | 3, una vez | Solo conversión |
| Básica | 3 | 10 | Solo conversión |
| Especial | 10 | 20 | Conversión + Historial |
| Atlas | 20 | Sin tope fijo, se cotiza | Todo el producto |

Los números de páginas (10/20) salen de modelar el comportamiento financiero de dos
perfiles de consumidor peruano (sueldo mínimo-medio, muy activo en Yape por built-in
necesidad de controlar el gasto; "sueldo bacán"/freelancer, con suscripciones, tarjeta y
compras en línea) contra la tasa observada de ~30 movimientos por página, y se cruzaron con
una segunda estimación independiente que llegó a números casi idénticos. No son una
estadística de usuarios reales todavía: hay que revisarlos con los primeros meses de uso real
(percentiles de `job_attempts.page_count` por plan).

Especial suma la vista Historial (para que esa persona pueda seguir su propio acumulado),
no Centro Financiero ni Calendario: esas quedan como diferenciador exclusivo de Atlas. Es una
decisión de producto tomada aquí, a falta de un pedido explícito sobre qué vistas le tocan a
Especial.

### El cobro sigue siendo manual

No hay pasarela de pago ni columna de precio en el catálogo: sigue siendo un criterio
aparte, cobrado por Yape a mano. Lo único que hace este ADR es dejar el dato (páginas
acumuladas por persona) disponible sin tener que calcularlo fuera del sistema:
`job_attempts.page_count` ya existía; lo nuevo es la consulta de 30 días, no una tabla nueva.

## Alternativas consideradas

- **Cobrar por página, en vez de por acumulado del plan.** Más preciso, pero mala
  experiencia: nadie sabe cuántas páginas tiene su estado antes de subirlo, y con cobro
  manual por Yape añade trabajo de facturación que hoy no vale la pena. Queda como opción
  futura si se automatiza el cobro.
- **Dejar `max_pages_per_document` como único límite y subir su valor en Atlas a un número
  grande.** No resuelve el problema de fondo: un número que a la vez es seguridad y cobro
  obliga a elegir entre un tope técnico demasiado bajo o un tope de cobro demasiado alto.
- **Un tope de cobro por documento en vez de acumulado mensual.** No refleja el costo real:
  alguien con muchos documentos chicos paga igual que alguien con pocos, aunque el consumo
  real del primero sea mayor.
- **Gratuito con cupo mensual en vez de una sola vez.** Dejaría sin motivo para pagar a una
  parte importante del perfil de sueldo mínimo, que es además el segmento más sensible al
  precio.
- **Period fijo (`period_start`/`period_end` guardado) en vez de ventana móvil de 30 días.**
  Una ventana móvil, calculada en la consulta, no necesita columnas nuevas de periodo ni una
  tarea que la reinicie; es el mismo principio que ya usa el cupo de documentos.

## Consecuencias

- `membership_plans` gana `monthly_page_quota` (nulo: sin tope fijo) y `trial_one_time`;
  `organization_memberships` gana `trial_used_at`. Migración de datos idempotente
  (`cobro_por_paginas_acumuladas`), sin tocar código para los dos planes nuevos.
- `max_pages_per_document` cambia de significado: ya no es "el límite de tu membresía", es
  la protección técnica. La interfaz y los mensajes de error dejaron de mostrarlo como el
  límite de la persona: ahora muestran `monthly_page_quota` y, en el rechazo, cuánto queda
  del mes.
- `StatementsService` ya no envía al worker el tope estático del plan: envía lo que queda del
  acumulado mensual, calculado por el nuevo `StatementUsageService`. El mecanismo de rechazo
  del worker (`PDF_PAGE_LIMIT_EXCEEDED`, contar antes de extraer) no cambia; solo cambia qué
  número le llega como `max_pages`. El worker no se tocó.
- Nuevos códigos de error: `MONTHLY_PAGE_QUOTA_EXCEEDED` (se agotó el mes) y
  `TRIAL_ALREADY_USED` (la prueba única ya se gastó). Ambos documentados en la interfaz con
  el mismo patrón de avisos de ADR-0016 (tipo, código, referencia, hora, teléfono).
- Las cuentas que ya existían (Básica, Atlas) cambian de límite de páginas sin que nadie
  tenga que hacer nada: la migración actualiza el catálogo, no las membresías.
- Pendiente fuera de este cambio: precio en soles de cada plan, automatizar el cobro (Culqi,
  a futuro) y confirmar con datos reales de los primeros meses si 10/20 son los números
  correctos.

## Anexo — 2026-11-25: Atlas pasa a ser una recarga, y el catálogo se administra desde la app

El responsable del producto ajustó el modelo con una tabla de precios y pidió dos cosas más:
que Atlas deje de ofrecerse como membresía que alguien elige, y que los planes se administren
"desde la base" — sin que cada ajuste sea una migración de código que yo misma escriba.

### Básico y Especial cambian de números y de vistas

| Plan | Páginas/mes | Vistas |
| --- | --- | --- |
| Básico | 15 (antes 10) | + Centro Financiero |
| Especial | 15 (antes 20) | Historial + Centro Financiero + Calendario (antes solo Historial) |

Básico y Especial quedan con el mismo tope de páginas a propósito: la tabla del responsable
del producto los pone iguales en páginas y los diferencia por vistas y precio, no por cupo.

### Atlas se convierte en una recarga, no en un plan que se elige

Atlas deja de ofrecerse en el alta de una persona normal. Sigue existiendo en el catálogo
porque las cuentas de administrador y superadministrador lo siguen usando (rol →
`default_plan_code`), pero para un cliente real ya no es "el cuarto plan": es una recarga que
un **administrador** (rango ADMIN, no hace falta superadministrador) le pone a alguien que ya
tiene Básico o Especial, después de cotizarlo y cobrarlo por fuera del sistema, igual que
siempre.

Técnicamente es un número nuevo en la membresía:
`organization_memberships.monthly_page_quota_override` (nulo: usa el tope de su plan). Se
resuelve en un solo punto — `toMembershipAccess`, que ya calculaba el acumulado efectivo —
así que nada más en el sistema (el worker, el aviso de la subida, la sesión) necesita saber
que la recarga existe: todos siguen viendo un único número de páginas al mes. Lo escribe
`PATCH /v1/users/:userId` con `monthlyPageQuotaOverride`, bajo el mismo permiso que ya movía
el plan (`CHANGE_PLAN`): subir el tope de alguien es, en los hechos, la misma decisión de
negocio que cambiarle de plan.

### El catálogo se administra con una API, no con una migración por cambio

Los planes ya eran un catálogo en la base (ADR-0016), pero cambiarlos exigía que alguien
escribiera y aplicara una migración SQL. Ahora existe un permiso nuevo,
`PLANS_MANAGE` — solo lo tiene `SUPER_ADMIN`, no `ADMIN`: cambia el negocio para todas las
organizaciones, no una cuenta a la vez — y tres rutas:

- `GET /v1/plans/admin`: todo el catálogo, activo o retirado.
- `POST /v1/plans`: crea un plan nuevo (código, nombre, páginas, documentos, vistas).
- `PATCH /v1/plans/:code`: cambia lo que se envíe; `features` reemplaza la lista completa.

Seguir pudiendo crear un plan con una migración (la guía de ADR-0016) no se pierde: ambas vías
escriben las mismas tablas. La API es para cuando no hace falta —ni conviene— desplegar código
solo para subir un precio o una vigencia de página.

## Anexo — 2026-11-26: el consumo de páginas se registra aparte del historial documental

**Problema encontrado.** El acumulado de 30 días se calculaba sumando `job_attempts.page_count`
en vivo. Pero `jobs` y `job_attempts` se borran en cascada con su `statement` (`ON DELETE
CASCADE` en el esquema y en el DDL real), y hay tres caminos legítimos que borran un documento:
el borrado explícito de su dueño (ADR-0017), la limpieza automática del cupo de documentos
(ADR-0007/ADR-0014) y el borrado de una cuenta. Los tres pasan por el mismo
`StatementRetentionService.deleteStatement`. Resultado: borrar un documento bajaba el acumulado,
y como el borrado también se llevaba la clave de idempotencia (`jobs.idempotency_key`), hasta el
mismo PDF se podía volver a subir. Repetible sin límite dentro de la ventana: el tope mensual no
servía de nada frente a alguien que lo supiera. Verificado contra Postgres real, no solo leyendo
el código.

**Decisión.** El cobro tiene su propia fuente de verdad, separada de lo que el historial documental
puede borrar:

- Tabla nueva `page_consumption_entries`, append-only: la aplicación solo inserta. Guarda una copia
  de `page_count` y de `finished_at` (como `occurred_at`) en el momento de registrar, y nunca vuelve
  a leerlas del intento.
- `job_attempt_id`, `statement_id` y `user_id` son `ON DELETE SET NULL`, nunca cascada: borrar el
  documento (o la cuenta) deja la fila del consumo intacta, solo sin la referencia. Es el mismo
  criterio que ya usaba `statements.uploaded_by`.
- Se escribe dentro del mismo `$transaction` que crea el `job_attempt`, solo si hay una persona
  detrás (no una credencial de servicio, que nunca tuvo tope de páginas) y si el intento entra en
  los estados que cuentan (`SUCCEEDED`, `NEEDS_REVIEW`). Nunca hay un momento en que el intento
  existe y el consumo no.
- Índice único `(organization_id, job_attempt_id)`: un mismo intento no se puede contar dos veces.
- `StatementUsageService.pagesUsedInCurrentPeriod` deja de consultar `job_attempts` y suma
  `page_consumption_entries` por organización, persona y `occurred_at`.

**Datos anteriores al cambio.** `npm run backfill:page-consumption` (o
`node dist/cli/backfill-page-consumption.js` en producción) rellena el registro con los intentos
que todavía existen; se corre una vez por entorno tras la migración y repetirlo no duplica nada.
Lo que ya se había borrado antes de este cambio no deja rastro —su `job_attempt` desapareció con
el documento— así que no se reconstruye ni se estima: ese consumo ya estaba fuera del acumulado y
sigue fuera.

**Lo que esto no resuelve todavía.** Dos subidas concurrentes del mismo usuario pueden pasar ambas
el chequeo del acumulado antes de que ninguna haya registrado su consumo (la lectura del acumulado
no tiene lock y ocurre antes de la llamada al worker). Es un problema distinto, también
confirmado; lo resuelve el anexo siguiente.

## Anexo — 2026-11-26: reserva de páginas antes de llamar al worker (concurrencia)

**Problema.** El chequeo del acumulado era una lectura sin lock, hecha antes de la llamada al worker
—que tarda: extrae el PDF— y antes de la única transacción que registra el consumo. Dos subidas
simultáneas de la misma persona leían el mismo acumulado; si cada una cabía por separado, ambas
pasaban aunque juntas excedieran el tope. La clave de idempotencia no protege: solo evita
reprocesar el mismo contenido, no dos documentos distintos a la vez.

**Decisión.** Cada subida aparta su techo de páginas antes de llamar al worker, en tres pasos, porque
no se puede mantener una transacción abierta durante toda la extracción:

1. **Reservar** (`StatementUsageService.reserveMonthlyQuota`, transacción corta): lock de aviso
   por persona (`pg_advisory_xact_lock(hashtextextended('<organización>:<persona>', 0))`), luego
   suma lo consumido (`page_consumption_entries`) y lo apartado por otras subidas en curso
   (`page_reservations` en `PENDING`), y aparta lo que queda como techo. Se usa un lock de aviso y
   no `SELECT ... FOR UPDATE` porque una persona sin filas todavía no tendría nada que bloquear.
2. **Llamar al worker** fuera de cualquier transacción, con ese techo como `max_pages`: el
   documento nunca puede pasar de lo apartado (el respaldo de la API ya rechazaba un PDF por encima
   de `max_pages`).
3. **Resolver** dentro de la misma transacción que registra el consumo real: la reserva pasa a
   `COMMITTED` si el intento consume, o a `RELEASED` si no (intento fallido). Lo apartado y lo
   consumido nunca cuentan a la vez, ni hay un momento en que no cuente ninguno. Si la subida falla
   antes de registrarse (worker caído, PDF por encima de lo apartado, fallo al guardar), la reserva
   se libera; liberar solo toca una reserva aún `PENDING` y nunca lanza, para no tapar el error real.

Una reserva que quedó `PENDING` porque el proceso murió a media subida deja de contar pasado
`WORKER_TIMEOUT_MS` más cinco minutos, así nadie queda bloqueado. No hay tarea programada: el filtro
está en la consulta.

Dos rechazos distintos, para no confundir a la persona: `MONTHLY_PAGE_QUOTA_EXCEEDED` (422) si el
mes está agotado de verdad, y `UPLOAD_IN_PROGRESS` (409) si queda margen pero otra subida en curso
lo tiene apartado — basta con esperar. La interfaz no reintenta sola este segundo caso.

**Consecuencia aceptada.** Se aparta el techo, no las páginas reales (que solo se conocen al volver
del worker): mientras una subida está en curso, aparta todo lo que le queda a la persona (o el tope
técnico, si es menor), y una segunda subida simultánea suya recibe `UPLOAD_IN_PROGRESS` aunque
habría cabido. Es conservador a propósito: la interfaz ya sube un documento a la vez, y la
alternativa —confiar en el número de páginas que declare el cliente— abriría otro agujero.

**Lo que no cambia.** Cómo se cobra: sigue siendo la ventana móvil de 30 días de este ADR. La tabla
de reservas está pensada para que, cuando existan lotes de páginas con vencimiento propio, una
reserva reparta su techo entre lotes; hoy reserva contra el tope del plan.

Verificado contra Postgres real con el servicio verdadero: ocho reservas simultáneas de la misma
persona con 5 páginas libres apartaron en total exactamente 5 (una de 5; o 2+2+1 con un tope técnico
de 2), y el resto recibió `UPLOAD_IN_PROGRESS`.

## Criterio de revisión

Revisar cuando el cobro se automatice (ahí sí conviene un periodo guardado y cobro por
consumo real, no solo por plan), cuando los datos reales de `job_attempts.page_count` por
plan contradigan los supuestos de comportamiento de este ADR, cuando se decida un precio real
para la recarga Atlas (hoy sigue siendo "cotizar" fuera del sistema), o si hace falta que un
administrador (no solo superadministrador) también administre el catálogo.
