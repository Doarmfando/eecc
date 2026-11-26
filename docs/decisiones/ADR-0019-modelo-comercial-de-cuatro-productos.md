# ADR-0019: Modelo comercial de cuatro productos: membresías con precio y productos de saldo aparte

- Estado: Aceptada (se implementa por etapas; ver el estado al final)
- Fecha: 2026-11-26
- Amplía: [ADR-0016](ADR-0016-roles-y-membresias-como-catalogo.md) (el catálogo de membresías
  vive en la base) y [ADR-0018](ADR-0018-cobro-por-paginas-acumuladas-y-tope-tecnico.md) (cobro
  por páginas acumuladas). Cuando el saldo pase a lotes de páginas, este ADR reemplazará la parte
  de cobro de ADR-0018: el tope mensual único y la «recarga Atlas» manual
  (`monthly_page_quota_override`).

## Contexto

El responsable del producto definió la oferta de lanzamiento de ATLAS con cuatro productos, sin
restricción por profesión:

| Producto    | Precio                        | Páginas             | Vigencia          | Vistas |
| ----------- | ----------------------------- | ------------------- | ----------------- | ------ |
| Gratuito    | S/ 0                          | 3, una sola vez     | —                 | No     |
| Personal    | S/ 19.90 por periodo          | 50 por periodo      | El periodo pagado | Todas  |
| Recargas    | S/ 0.15 por página, mínimo 20 | Las que se compren  | 90 días           | No     |
| Profesional | S/ 29.90 / 59.90 / 89.90      | 500 / 2,000 / 6,000 | 90 días           | No     |

Personal reemplaza a Básica y Especial. El saldo de las compras se acumula en lotes
independientes, cada uno con su propio vencimiento, y se consume primero el que vence antes
(FEFO).

Hasta ahora no había ningún precio en el sistema: el cobro era manual por Yape y el administrador
ajustaba a mano un único número de páginas por persona. Tampoco había dónde guardar una compra
que no fuera un cambio de membresía.

## Decisión

### Dos catálogos distintos: membresías y productos de saldo

- **Gratuito y Personal son membresías** (`membership_plans`). La membresía es la identidad
  comercial de la cuenta: una sola a la vez, decide qué vistas se ven y hasta cuándo. Ganan una
  columna de precio publicado (`price_amount`, nula si el plan no se vende por catálogo) y
  `currency`.
- **Recargas y Profesional son productos de saldo** (`commercial_products`, tabla nueva). Son
  compras que se apilan: una persona puede tener varias a la vez, cada una con su saldo y su
  vencimiento, y ninguna habilita vistas. Cada producto tiene una forma de precio:
  - `PER_PAGE`: se cobra exacto por página, sin redondear a múltiplos (23 páginas a S/0.15 son
    S/3.45), con un mínimo por compra (`minimum_pages`).
  - `PACKAGE`: paquete cerrado de `page_quantity` páginas a un precio fijo.

  Una restricción de la base (`commercial_products_pricing_shape`) exige que cada forma tenga su
  dato y no el de la otra; la API valida lo mismo antes para responder
  `PRODUCT_PRICING_SHAPE_INVALID` en vez de un error de SQL.

### Dinero: `DECIMAL` en la base, céntimos enteros en la API

Los importes se guardan como `DECIMAL(10,2)` en soles: se leen tal cual en un reporte SQL y nunca
pasan por coma flotante. La API y la interfaz los manejan en **céntimos enteros** (`priceCents`),
como los demás importes del frontend ([`monedas.md`](../arquitectura/monedas.md)); la conversión
está en un solo lugar (`src/common/money/cents.ts`). Un precio por página también es un número
exacto de céntimos, así que el total de una recarga es una multiplicación de enteros.

### Cotización y sugerencia del paquete que conviene

`GET /v1/commercial-products/:code/quote?pages=N` dice cuánto cuesta una compra. Para una recarga,
además, busca el paquete activo más barato que dé **al menos esas páginas por no más dinero**, y
lo devuelve como sugerencia con el ahorro: 200 páginas sueltas cuestan S/30.00 y Profesional 500
cuesta S/29.90. La cotización no registra nada.

### Lo vendido no cambia con el catálogo

El precio y la vigencia de un producto se pueden cambiar desde la app (`PLANS_MANAGE`), pero el
cambio aplica a las compras siguientes: cada compra guardará lo que se pagó y su propio
vencimiento al registrarse. El código y la forma de precio no se cambian (un paquete que pasa a
cobrarse por página es otro producto), y un producto no se borra: se retira con `is_active`.

### Compras registradas por un administrador; sin cobro automático

Decisión del responsable del producto: una compra de Recarga o Profesional la registra un
administrador al confirmar el pago por Yape, y el saldo se activa en ese momento. No hay bandeja de
aprobación ni estado «pendiente de pago». No se da por implementado ningún cobro recurrente
mientras no exista una integración con una pasarela de pagos.

### Periodo de Personal desde la activación o renovación

Decisión del responsable del producto: las 50 páginas de Personal se cuentan por periodo de un mes
desde que la membresía se activa o se renueva, no por mes calendario. Encaja con «50 páginas por
cada periodo pagado» y con cómo hoy se pone la vigencia al cobrar por Yape. Cancelar no corta el
periodo ya pagado; al vencer Personal se conservan las páginas vigentes de Recargas y Profesional.

### «ATLAS» queda solo como marca comercial

El plan interno de administradores, que hoy se llama `ATLAS` y no tiene tope, se renombra para que
«ATLAS» designe solo a los productos que se venden (ATLAS Personal, ATLAS Recargas, ATLAS
Profesional). Su comportamiento no cambia.

## Alternativas consideradas

- **Recargas y Profesional como filas de `membership_plans`.** Rechazada: la membresía es una por
  cuenta y decide las vistas; mezclar compras apilables ahí obligaría a excepciones en cada lugar
  que lee el plan, justo para algo que el pedido exige que no habilite vistas.
- **Importes en coma flotante, o en céntimos también en la base.** Coma flotante, rechazada sin
  más. Céntimos enteros en la base habrían funcionado, pero `DECIMAL` deja los reportes legibles
  en soles sin conversión y es lo que la base ofrece para dinero.
- **Redondear las recargas a múltiplos (de 10, de 20).** Rechazada por el responsable del
  producto: se cobra exacto por página.
- **Compra pendiente hasta que un administrador apruebe el pago.** Rechazada: hoy el pago se
  confirma por fuera (Yape) y quien lo confirma es quien registra la compra; una bandeja de
  aprobación sería un paso más sin información nueva.
- **Periodo de Personal por mes calendario.** Rechazada: quien paga el día 25 tendría pocos días
  de su primer periodo.

## Consecuencias

- La pantalla _Planes y membresías_ muestra y edita el precio de cada plan, y tiene una sección
  _Productos de saldo_ para crear y cambiar Recargas y paquetes. Rutas bajo `PLANS_MANAGE`; la
  lista de productos activos y la cotización, con cualquier sesión.
- `PERSONAL` existe desde la migración del catálogo, pero **retirado**: se ofrece recién cuando el
  saldo pase a lotes y Básica y Especial migren a él, para que nadie quede con un modelo de cobro
  a medias.
- La rama comercial calcula el saldo y reserva páginas por lotes. El cambio de membresías de las
  cuentas existentes requiere la etapa 6.
- *Mi saldo* muestra compras y consumo en historiales paginados. El consumo se lee de
  `page_consumption_entries`, por lo que conserva las conversiones registradas aunque se borre
  el documento. La API limita las consultas al usuario y a la organización de la sesión.
- Los códigos de error nuevos (`PRODUCT_NOT_FOUND`, `PRODUCT_ALREADY_EXISTS`,
  `PRODUCT_PRICING_SHAPE_INVALID`, `QUANTITY_BELOW_MINIMUM`) solo exponen el código, como el resto
  de la API.

## Estado de implementación

Plan completo en [`tareas-en-curso.md`](../roadmap/tareas-en-curso.md) §21.

| Etapa | Qué                                                              | Estado                             |
| ----- | ---------------------------------------------------------------- | ---------------------------------- |
| 1     | Registro de consumo independiente del historial                  | Hecha (anexo ADR-0018)             |
| 2     | Reserva de páginas contra subidas simultáneas                    | Hecha (anexo ADR-0018)             |
| 3     | Catálogo de productos de saldo y precios (este ADR)              | Hecha                              |
| 2b, 4 | Lotes de páginas, FEFO, compras registradas por un administrador | Implementada en la rama           |
| 5     | Saldo, cotización e historiales comerciales                      | Implementada en la rama           |
| 6     | Migración de clientes: Básica/Especial → Personal, renombre      | Candidatos compatibles ensayados localmente. Excepciones y producción pendientes. |
| 7     | Panel comercial con métricas                                     | Pendiente                          |

## Criterio de revisión

- Si se integra una pasarela de pagos: las compras dejan de registrarse a mano y hace falta un
  estado de pago.
- Si se vende en otra moneda que no sea soles: hoy todo el catálogo es `PEN` y la sugerencia de
  paquete no compara monedas distintas.
- Si aparece un producto que habilite vistas sin ser una membresía: la separación de este ADR
  supone que solo la membresía decide las vistas.

## Anexo — 2026-11-26 — Corte manual y conservación de condiciones

La activación del catálogo comercial y el cambio de las membresías compatibles ocurren juntos en
una transacción manual de Prisma. La simulación usa una transacción de solo lectura. El corte
conserva ancla, vigencia, compras y consumo previo sin otorgar un segundo lote del periodo. El
plan interno `ADMINISTRACION` se asigna a los roles administrativos y los planes heredados se
retiran de las altas. Las membresías con condiciones pactadas o Atlas en otros roles conservan
su plan mientras se decide su transición. Ver [informe de impacto](../roadmap/migracion-a-personal.md).
