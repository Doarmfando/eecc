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

## Criterio de revisión

Revisar cuando el cobro se automatice (ahí sí conviene un periodo guardado y cobro por
consumo real, no solo por plan), cuando los datos reales de `job_attempts.page_count` por
plan contradigan los supuestos de comportamiento de este ADR, o cuando se decida qué vistas
adicionales (si alguna) le corresponden a Especial.
