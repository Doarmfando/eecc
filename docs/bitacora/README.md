# Bitácora del proyecto

Registrar cambios materiales en orden descendente. No incluir datos bancarios, rutas personales, secretos ni contenido de documentos.

## Formato

```markdown
## YYYY-MM-DD — Título breve

- Hecho: resultado verificable.
- Decisión: cambio de dirección, si aplica.
- Verificación: pruebas o comprobaciones ejecutadas.
- Pendiente: siguiente paso concreto.
```

## 2026-10-29 — Video promocional vertical con Remotion

- Hecho: nueva carpeta `video-promo/`, proyecto Remotion independiente (no comparte dependencias con el frontend ni con los backends). Composición `PromoVertical`: 1080×1920, 30 fps, 50 s, seis escenas (gancho, cuatro pasos y cierre) con Anton y Poppins, azul `#0056C6` y coral `#D97757`. `render.ps1` lo renderiza en local a `out/video-promo/`; `scripts/generar-voz.ps1` crea una voz provisional con el sintetizador de Windows, sin servicios externos. El guion vive en `video-promo/src/guion.json`.
- Decisión: el guion se ciñe a lo que hace el código: cuatro bancos validados y Scotiabank «próximamente»; el banco se marca pero el worker detecta la plantilla; «Requiere revisión» cuando no cuadra; CTA «Pide tu acceso» porque no hay registro abierto. Se escriben los nombres de los bancos, no sus logotipos. Las cifras son sintéticas.
- Verificación: `tsc --noEmit`; render completo con voz y subtítulos (ffprobe: H.264 1080×1920, 30 fps, 50,0 s, AAC) y revisión visual de fotogramas de cada escena.
- Pendiente: sustituir la voz provisional por una locución final y elegir música con licencia; fijar el contacto real con `-Contacto`.

## 2026-10-26 — Un movimiento de diciembre en el estado de cuenta de enero ya no salta al año siguiente

- Contexto: el calendario mostraba en diciembre de 2026 un abono que era del 31 de diciembre de 2025. Venía en el estado de cuenta de enero de 2026: el banco lo procesó tarde y lo imprimió con su fecha, `31DIC`, sin año. BCP le ponía a todas las fechas el año del cierre del periodo, y Banco de la Nación, con un periodo dentro de un solo año, también. La herramienta Python anterior tenía el mismo fallo. Pedido y vistas nuevas del frontend en §15 y §16 de la lista viva.
- Hecho (worker): `StatementPeriod` pasa a `parsing/dates.py` y `parse_statement_date` acepta el periodo. Una fecha sin año se coloca en el año que la deja más cerca del periodo: dentro, distancia cero; un movimiento tardío o una fecha valor posterior al cierre, a días; el mismo día de otro año, a meses. El año impreso sigue mandando. BCP lee el periodo `DEL … AL …` de la primera página y lo lleva hasta el analizador de filas; sin periodo legible conserva el año de respaldo de antes (el indicado al subir o el de la primera fecha con año). Banco de la Nación usa el mismo periodo en vez de su regla propia. BBVA no cambia: no declara periodo y su regla de la fecha de emisión ya resolvía el cruce; Interbank imprime el año.
- Versiones: BCP `0.5.3`, Banco de la Nación `0.4.1`, `PROFILE_VERSION=statements-2026.10.26`, para que volver a subir el PDF lo procese de nuevo en vez de reutilizar el resultado con el año mal.
- Verificación: las pruebas nuevas fallan con el código anterior (el 31-12 salía 2026, como en la captura) y pasan con el arreglo: periodo de enero con `31DIC`, fecha valor de enero tras un cierre de diciembre, periodo que cruza el año, año impreso, 29 de febrero sin año bisiesto cerca, y un PDF BCP sintético de enero de dos páginas (`create_synthetic_bcp_pdf` acepta `period_label` y `movement_days`). Worker `scripts/check.ps1` (393 pruebas, 93,7 %, Ruff y mypy) y API `npm run check` (268). El frontend no cambia: el mes del documento sale de la mayoría de sus fechas, así que el movimiento de diciembre no mueve el estado de cuenta de enero. No se probó con un estado de cuenta real de enero: no hay ninguno en la carpeta de muestras.
- Despliegue: worker (`03186dd8`) y después la API (`f134f70f`) con `railway up`, con `PROFILE_VERSION=statements-2026.10.26` cambiada antes sin redesplegar. Los dos arrancaron; `/health` responde 200 y la página se sirve. La CLI había perdido la sesión y hubo que volver a entrar. Sin prueba de humo con cuenta: las contraseñas de los superadministradores no están en este entorno. El frontend de Vercel no cambia.
- Pendiente: los documentos ya convertidos conservan la fecha equivocada: borrarlos del Historial y volver a subirlos (si quedan los dos, el calendario cuenta los movimientos dos veces). El movimiento de diciembre aparece ahora en diciembre de 2025, un mes sin saldo inicial si no se subió ese estado de cuenta; es lo que pueden mostrar las vistas «pendiente» y «acumulado» que se arman en el frontend (§16).

## 2026-10-21 — Página incompleta señalada y aviso al terminar con discrepancias

- Contexto: el BCP de mayo (478 páginas) quedaba en «Requiere revisión» sin decir por qué. La página 424 del PDF trae 16 movimientos frente a 35 en las demás, con dos huecos en blanco, y según los totales y el saldo final que imprime el banco faltan abonos. El PDF está incompleto; el extractor lee bien lo que hay. El responsable del producto pidió un aviso para continuar con Enter, volver a intentar o cancelar (§14 de la lista viva).
- Hecho (worker): nuevo aviso `BCP_PAGE_INCOMPLETE` con número de página. `find_sparse_pages` compara las filas visuales de cada página intermedia (entre la primera y la última página con filas) con la mediana y marca las que tienen menos de 3/4. Solo se busca si ya falló la reconciliación (`BCP_DECLARED_TOTAL_MISMATCH` o `BCP_BALANCE_MISMATCH`), así que nunca cambia el estado de un documento que cuadraba. El payload añade `warning_pages: [{code, page}]`; los manifiestos anteriores sin la clave se siguen leyendo. BCP pasa a `0.5.1` y luego a `0.5.2` (ver la revisión). El generador sintético BCP acepta `pages_with_gaps`.
- Hecho (API): acepta y valida `warning_pages` (código de 1 a 64 caracteres, página entera entre 1 y `page_count`; cualquier otra forma es un payload incoherente y responde 502), guarda una fila de `job_warnings` por código y página en la columna `page`, que ya existía (sin migración), y devuelve `warningPages` en `JobResponseDto`; `warningCodes` sigue sin repetidos. `PROFILE_VERSION=statements-2026.10.21.2`. La API sigue sin devolver importes.
- Hecho (frontend): al llegar al resultado desde la carga con un `NEEDS_REVIEW` que publicó archivos se abre «El resultado no cuadra con los totales del banco»: qué pasó en frases, empezando por la página, y, si hay `BCP_BALANCE_MISMATCH`, el saldo final según el banco con lo leído y la diferencia, calculados en el navegador desde el CSV `Resumen` (ADR-0002, ADR-0010). Tres salidas: **Continuar** (tiene el foco y responde a Enter; Escape y ✕ también continúan, no borran), **Volver a intentar** (borra esta conversión y vuelve a la carga para subir el PDF descargado de nuevo) y **Cancelar conversión** (la borra). Recargar o abrir desde el historial no vuelve a preguntar. La carga ya no muestra el «convertido» en verde cuando hay discrepancias.
- Hecho (frontend): los textos de las advertencias viven en `components/shared/warning-labels.ts`. Se corrigieron claves que no coincidían con los códigos reales (`BCP_DATE_UNPARSEABLE`, `BCP_CONTINUATION_AMOUNT_CONFLICT`) y se añadieron las que faltaban, incluida `BCP_BALANCE_MISMATCH`.
- Verificación automática: worker `scripts/check.ps1` (381 pruebas con cobertura, Ruff y mypy), API `npm run check` (268 pruebas), frontend `npm run check` (306 pruebas).
- Verificación real local con el BCP de mayo, sin copiar contenido (10 comprobaciones): página 424 señalada y guardada, la diferencia de saldo coincide con la del análisis, idempotencia al repetir la carga; el BCP de agosto sigue reconciliado y sin avisos. Navegador con Playwright en escritorio y móvil: aviso, foco, Enter, recarga, volver a intentar y cancelar.
- Revisión independiente del cambio (otro agente) y correcciones: el historial contaba filas de `job_warnings`, así que un aviso en tres páginas sumaba tres; ahora cuenta códigos distintos, igual que la página del documento. Volver a subir un documento que ya se tenía (`reused`) no reabre el aviso: ofrecía borrar lo que no se acababa de subir; la señal sale del estado de la carga porque al pedir el trabajo de nuevo la API ya no la marca. Si el cupo reemplazó otro documento, el aviso dice que cancelar no lo devuelve. Solo un descuadre con el banco manda a bajar otra vez el PDF; otros avisos traen su propia indicación. `find_sparse_pages` acota por la primera y la última página con filas: una página final de avisos sin movimientos ya no convierte la última página del mes en «intermedia»; por eso BCP `0.5.2` y `statements-2026.10.21.2`. La API rechaza una página mayor que `page_count` (no desborda la columna entera).
- Despliegue: worker y API en Railway; producción verificada sin cuenta (el paquete publicado trae el aviso, la API arrancó sin migraciones pendientes y el worker en marcha). La prueba de humo con cuenta no se pudo pasar: las contraseñas iniciales de los superadministradores ya no son válidas (se cambiaron, como se recomendó).
- Pendiente: un documento convertido antes del despliegue no gana la página; hay que volver a subirlo. Otros bancos aún no ubican sus avisos por página.

## 2026-10-21 — Despliegue en Railway de roles, membresías, vigencia y borrado

- Contexto: el responsable del producto pidió desplegarlo todo y completar la configuración con valores ficticios.
- Hecho: worker y API (con el frontend) subidos con `railway up`. Railway no despliega al hacer push: producción seguía en el código del 17 de octubre, así que este despliegue llevó también lo del 17-19 (Excel BBVA con encabezado, hojas comunes, ADR-0012 a ADR-0015) y la migración `statement_source_file_name`, que estaba pendiente. Se aplicaron `roles_y_membresias` y `vigencia_de_membresia`. Variables de la API: `PROFILE_VERSION=statements-2026.10.18`, `BUSINESS_TIMEZONE=America/Lima` y `SUPPORT_PHONE=+51 900 000 000` (**ficticio**).
- Hecho: superadministradores `brando@hotmail.com` y `fabio@hotmail.com` creados en producción. `railway ssh` exigía que una persona vinculara la clave en la web y la base sigue privada, así que el arranque los asegura desde `BOOTSTRAP_SUPER_ADMINS` (mismo patrón que `BOOTSTRAP_ADMIN_*`, idempotente, registra solo cuántos); la variable se retiró después. Las contraseñas iniciales se entregaron fuera del repositorio.
- Hecho: los 5 usuarios normales de producción recibieron vigencia **ficticia** hasta el 31-12-2026 (quedaron en Básica, como fija la migración); el administrador existente quedó en Atlas y sin vencimiento.
- Defecto encontrado y corregido: todas las subidas fallaban en producción con `INVALID_JOB_OPTIONS`. La imagen resuelve FastAPI 0.156, que lee un `bool` de formulario ausente como `False`; la API no envía `export_xlsx`/`export_csv`, así que el worker recibía «ningún formato». En local (0.141) no ocurría. Ahora se leen como texto con el valor por defecto en el código; probado con 0.141 y con 0.156 (suite completa en un entorno 3.12 con las dependencias de la imagen).
- Respaldo: no se pudo tomar un volcado previo (sin SSH ni acceso público a la base, PITR desactivado). Las dos migraciones son transaccionales y no borran datos (el rol se copia antes de quitar la columna).
- Verificación en producción (16 comprobaciones, solo PDF **sintéticos**): `/health`, la página, `GET /v1/support`, los dos superadmins con Atlas y sin vencimiento, catálogo de roles y planes, vigencia en todos los usuarios normales, conversión de un BBVA sintético, rechazo de un BCP sintético de 20 páginas en Básica (`PDF_PAGE_LIMIT_EXCEEDED`, 20 frente a 15), borrado y borrado repetido (0), y `MEMBERSHIP_EXPIRED` al vencer. El usuario temporal se eliminó con sus documentos.
- Pendiente: que brando y fabio entren y cambien su contraseña; reemplazar el teléfono ficticio y las fechas ficticias por los reales; decidir quién pasa a Atlas; retirar `BOOTSTRAP_ADMIN_PASSWORD`, que sigue definida; activar copias de seguridad de PostgreSQL (PITR) o un respaldo periódico.

## 2026-10-21 — Vigencia de la membresía y borrado del historial

- Contexto: respondiendo a las dudas de la entrada anterior, el responsable del producto pidió fecha de vencimiento para la membresía de los usuarios normales, visible a los administradores en cada cuenta, y poder borrar documentos del historial de lo cargado. El resto, a criterio. También pidió commit y push del trabajo anterior (`5307cb5`).
- Hecho (base): migración `vigencia_de_membresia`: `organization_memberships.plan_expires_on` (`DATE`, último día de vigencia) y `roles.plan_expiry_required` (hoy solo `MEMBER`). Idempotente; las cuentas existentes quedan sin vencimiento.
- Hecho (API): «hoy» en `BUSINESS_TIMEZONE` (Lima) y no en UTC; la sesión trae `plan.expiresOn` y `plan.expired`. Alta de usuario normal con vencimiento obligatorio y no pasado; un admin nunca lo guarda; ascender lo quita; renovar o cambiarlo exige `CHANGE_PLAN`. Vencida, la carga responde `MEMBERSHIP_EXPIRED` (auditado) pero la persona entra y conserva lo suyo. `DELETE /v1/statements/{id}` y `DELETE /v1/statements` borran lo propio con sus archivos, responden `deletedCount` (cero si ya no estaba) y auditan cuántos y el alcance, sin nombres. CORS con `PATCH` y `DELETE`.
- Hecho (frontend): campo «Vence el» en alta (propone un mes; atajos 1, 3, 6 y 12 meses) y edición (renueva desde el vencimiento actual, o quitarlo); la tabla de usuarios muestra «Vence el …», «Vence en N días» o «Venció el …» y filtra las vencidas. La persona ve el aviso siete días antes y, vencida, la carga deshabilitada con la explicación. Borrar en el Historial (por documento y «Vaciar historial») y en el resultado de una conversión, con confirmación y el foco en «Cancelar».
- Decisión: ADR-0017. Al vencer se bloquea la conversión, no el acceso ni el plan; se borra de verdad, no se oculta.
- Verificación automática: API `npm run check` (257 pruebas, cobertura 96 %) más las 9 de aislamiento contra PostgreSQL local; frontend `npm run check` (290 pruebas, 96 %). El worker no cambió.
- Verificación real contra la API local con los PDF de la carpeta de muestras (26 comprobaciones): alta rechazada sin fecha, con fecha pasada o inexistente; vencida no convierte en la misma sesión y el rechazo queda auditado; renovada vuelve a convertir; borrar uno se lleva sus 6 artefactos, repetir responde 0, nadie borra lo ajeno (ni un superadmin) y vaciar deja el historial en cero. Navegador con Playwright a 1366 y 375 px (18 comprobaciones), sin errores de consola. Usuarios de prueba eliminados.
- Pendiente: desplegar (worker sin cambios; API con las dos migraciones; frontend) y poner fecha a los usuarios existentes desde *Usuarios*.

## 2026-10-20 — Roles y membresías como catálogo, superadministrador, límite de páginas y avisos para soporte

- Contexto: el responsable del producto pidió tipos de usuario, roles que puedan crecer y membresías: **Básica** (solo conversión, 3 documentos, 15 páginas por PDF) y **Atlas** (todo, 20 documentos, sin límite), con más planes en el futuro; un **superadministrador** que gestione incluso a los administradores, con dos cuentas (brando y fabio); el alta de usuario pidiendo siempre rol y plan; avisos en pantalla con el porqué y el tipo de error para poder llamar a soporte; idempotencia y patrones donde corresponda, y pruebas con la carpeta de muestras. La lista viva del pedido está en `docs/roadmap/tareas-en-curso.md`.
- Hecho (base): migración `roles_y_membresias`. Roles, permisos, membresías y funciones pasan a ser catálogos (`roles` con rango y plan sugerido, `permissions`, `role_permissions`, `membership_plans` con cupo y páginas, `features`, `plan_features`); `organization_memberships` apunta a rol y plan. El enum `MembershipRole` desaparece sin perder datos: administradores a Atlas, usuarios a Básica. Transacción única y semillas con `ON CONFLICT`. Sin deriva frente a Prisma.
- Hecho (API): la sesión trae rol, rango, permisos, plan y teléfono de soporte; `PermissionsGuard` reemplaza a `RolesGuard`. Reglas por rango en `users/member-rules.ts` (superior: todo; igual: solo lo reversible; superior a ti: nada; nunca asignar un rango mayor), con las acciones permitidas por cuenta en la lista. Cupo por plan y `replacedStatements` en la respuesta de carga. Límite de páginas: la API envía `max_pages`, el worker cuenta con pdfium antes de extraer y la API lo vuelve a comprobar antes de registrar. `meta` numérica en los errores. `GET /v1/plans`, `GET /v1/roles` (solo los asignables) y `GET /v1/support` (pública, `SUPPORT_PHONE`). Comando idempotente `access:super-admins`.
- Hecho (worker): `PdfPageLimitError` (`PDF_PAGE_LIMIT_EXCEEDED`, 422, con `page_count` y `max_pages`) antes de detectar y extraer; el límite no entra en la identidad del trabajo.
- Hecho (frontend): avisos globales con motivo, qué hacer, tipo, código, referencia, hora, teléfono y botón para copiar; los errores no se cierran solos y no se duplican. Menú y rutas según las funciones del plan, con explicación de qué membresía incluye una vista bloqueada. Plan visible en la barra lateral, el menú de cuenta y junto al formulario. Diálogo de reemplazo con scroll para 20 y aviso de lo reemplazado. Usuarios: rol y membresía obligatorios en el alta (Admin propone Atlas), edición de rol y membresía, columna «Rol y membresía», botones según las acciones de la API y filtros por los roles presentes.
- Decisión: ADR-0016. Las vistas del plan se aplican en la interfaz porque leen datos que la persona ya puede descargar; cupo y páginas, que es lo que cuesta, los aplica el servidor.
- Hallazgo: `local-postgres.ps1` abortaba si `pg_ctl` avisaba de un PID huérfano (PowerShell 5.1 trata stderr como error); ahora decide por el código de salida.
- Verificación automática: API `npm run check` (pruebas, ESLint, Prettier, Prisma; cobertura 95,9 % de líneas), worker `scripts/check.ps1` (369 pruebas, cobertura 93,6 %, Ruff, mypy), frontend `npm run check` (272 pruebas, cobertura 96 %).
- Verificación real autorizada, sin copiar contenido, con los 6 PDF de la carpeta de muestras contra la API local (47 comprobaciones): en Básica, Banco de la Nación (132 páginas) y los dos BCP (457 y 478) se rechazan con `PDF_PAGE_LIMIT_EXCEEDED` en ≤0,1 s sin extraer; los tres BBVA (10, 1 y 2 páginas) se convierten; el 4.º reemplaza el más antiguo o el elegido; repetir un PDF lo reutiliza sin borrar nada. En Atlas se procesan los seis (BCP en unos 14 s cada uno; el de mayo sigue en `NEEDS_REVIEW`, como ya se documentó), se llega a 20 sin reemplazos y el 21.º reemplaza el más antiguo. Un administrador no toca ni crea superadministradores ni elimina a otro administrador; un superadministrador degrada a un administrador y este pierde la gestión en la petición siguiente. Navegador con Playwright a 1366 y 375 px (18 comprobaciones): aviso de páginas con tipo y referencia, vista bloqueada, diálogo con foco en «Reemplazar y procesar», aviso de lo reemplazado, alta de administrador con Atlas propuesto; sin desbordes ni errores de consola. Los usuarios de prueba se eliminaron al terminar, con sus documentos.
- Pendiente: despliegue en orden worker, API (aplica la migración) y frontend; ejecutar `node dist/cli/super-admins.js brando@hotmail.com fabio@hotmail.com` en el servicio de la API y guardar las contraseñas; definir `SUPPORT_PHONE`. Revisar en *Usuarios* qué cuentas existentes deben pasar a Atlas. Confirmar si «pon tiempo» pedía una vigencia de la membresía.

## 2026-10-19 — Mismas hojas en todos los bancos, cabeceras BCP, BN e Interbank y columnas BBVA separadas

- Contexto: el responsable del producto pidió revisar que los Excel cumplan con la carpeta de referencia: cinco libros de otra herramienta (tres BBVA y dos BCP), sus capturas anotadas y la lista de pendientes. La otra herramienta es el exportador legacy: sus hojas BCP son las de `formatoBCP (1).py`. Después pidió lo mismo para Banco de la Nación e Interbank y completar lo que faltara.
- Revisión de lo ya hecho: los tres BBVA coincidían con la referencia en hojas, filas, tipo de fila, fechas, `Cargo/Abono`, `Cargo`, `Abono`, ITF, saldos y totales. El diálogo de reemplazo con el más antiguo elegido y Enter, la fecha de conversión, los nombres reales del PDF y del Excel y los mensajes de validación estaban en la interfaz. Faltaba lo de esta entrada.
- Hecho: BCP lee su cabecera (`bcp/header.py`) y publica las cuatro hojas del legacy: `Resumen` con `Tipo de cuenta`, `Encabezado`, `Movimientos` con el tipo de fila en español (`SALDO_ANTERIOR`, `MOVIMIENTO`, `TOTAL_MOVIMIENTO`, `SALDO`) y `Control_Paginas` con filas y columnas extraídas. Con el tipo de cuenta, el filtro Ahorro/Corriente del historial vale también para BCP.
- Hecho: el BBVA separa `Oficina`, `Canal` y `N.º operación` de la descripción según los rótulos de su cabecera; sin ellos, todo queda en la descripción como antes. Ningún banco publica ya `Validaciones`, y `Control_Paginas` es común (Interbank conserva `Página de guía`). Decisión en ADR-0015.
- Hecho: Banco de la Nación e Interbank leen su cabecera (`banco_nacion/header.py`, `interbank/header.py`) y publican las mismas cuatro hojas, con `Tipo de cuenta` y `Filas` en el `Resumen` y, en `Movimientos`, saldo anterior, arrastres `VAN`/`VIENEN` (`SALDO_ARRASTRADO`), totales y saldo final como filas tipadas. El genérico publica `Tipo de fila` y `Control_Paginas`, con la cabecera detectada en blanco.
- Hecho: el tipo de cuenta se clasifica con reglas generales y una tabla por banco (`parsing/account_type.py`), porque cada banco nombra sus productos a su manera: `CUENTA SIMPLE` es ahorro en Interbank.
- Hallazgo: el Banco de la Nación no declara su moneda en ninguna página (cabecera, cierre ni páginas intermedias). La celda queda vacía; la interfaz sigue mostrándolo en soles.
- Hallazgo: el BCP de mayo que quedaba en `NEEDS_REVIEW` es correcto. La página 424 del propio PDF trae dos tramos en blanco (16 movimientos en lugar de 35) y los abonos impresos superan a los movimientos. Cada importe de las columnas de todo el documento tiene su movimiento. La referencia da los mismos totales sin advertirlo, y su «último saldo» es el saldo anterior.
- Verificación real autorizada, sin copiar contenido: en los tres BBVA coinciden fila a fila también `Oficina`, `Canal` y `N.º operación`. En los dos BCP coinciden hojas, las 16.905 y 17.667 filas con sus tipos, descripciones, fechas, importes y filas por página. En `Encabezado` coinciden código de cuenta, moneda, periodo y páginas; la referencia ponía texto del pie como tipo de cuenta, pegaba los rótulos al titular y cortaba la dirección. Quedan dos diferencias a propósito: la referencia une las dos líneas de un concepto con « | » y cuenta la segunda como fila en `Control_Paginas`. En los dos Banco de la Nación reales (julio y agosto) la cabecera se lee completa; el de agosto da `SUCCEEDED` con su `Encabezado`, tipo `CORRIENTE` y `Control_Paginas` sumando lo mismo que el `Resumen`. No hay un Interbank real a mano: su cabecera se prueba con el sintético que reproduce la disposición del real.
- Verificación automática: worker `scripts/check.ps1`, API `npm run check` y frontend `npm run check`; la paridad con el legacy, que corre el script real sobre un PDF sintético con la cabecera medida, compara ahora también hojas y `Encabezado`.
- Pendiente: despliegue, en orden worker, API (`PROFILE_VERSION=statements-2026.10.18`) y frontend. Contrastar la cabecera Interbank con un documento real. Decidir dónde vive el catálogo de tipos de cuenta si va a crecer.

## 2026-10-17 — Formato común del Excel, totales BBVA brutos, elección del documento a reemplazar y fecha de conversión

- Contexto: el responsable del producto pidió generalizar a todos los bancos lo del Excel BBVA, encontrar por qué los totales del `Resumen` no coincidían con los de la referencia, elegir qué documento se reemplaza al llegar al cupo, mejores mensajes de validación, y la fecha y los nombres reales en el resultado.
- Hallazgo: las diferencias anotadas a mano en la referencia eran exactamente el ITF. El `Resumen` BBVA sumaba el impuesto a los cargos y lo restaba de los abonos; la referencia los deja brutos con el ITF aparte.
- Hecho: todos los bancos publican `Resumen` con `Archivo` y `Saldo inicial`, sin estado, extractor, versión ni confianza, y `Movimientos` con `Cargo/Abono` con signo junto a sus columnas separadas. BBVA añade `Cargo` y `Abono`, brutos, y sus totales suman esas columnas. BCP toma el saldo inicial de su fila de saldo anterior; el genérico lo deduce solo con los saldos demostrados (ADR-0013).
- Hecho: con el cupo lleno, la carga abre un diálogo con el más antiguo elegido y el foco en «Reemplazar y procesar»: Enter confirma. La API acepta `replaceStatementId` y lo ignora si no es de quien sube; el recién subido nunca se borra (ADR-0014).
- Hecho: el resultado muestra «Convertido el …» (`createdAt` en carga y detalle), el nombre real del PDF y del Excel en lugar de «PDF original» y «Excel del estado de cuenta», y lleva extractor y versión a la tarjeta de invariantes. Mensajes de validación con el nombre del archivo y qué hacer.
- Verificación real autorizada, sin copiar contenido: en los tres BBVA, `Cargo/Abono`, `Cargo` y `Abono` coinciden fila a fila con la referencia y los totales de cargos, abonos, ITF y saldo final también. Banco de la Nación, BCP y los tres BBVA publican y verifican XLSX y CSV con `Archivo` y `Saldo inicial`; `Cargo/Abono` es coherente con las columnas separadas en todas las filas.
- Verificación automática: worker `scripts/check.ps1`, API `npm run check` (191 aprobadas, 13 omitidas) más las 9 de aislamiento contra PostgreSQL local, frontend `npm run check` (pruebas del diálogo, la fecha, los nombres y los mensajes incluidas).
- Pendiente: un BCP real de mayo de 2026, añadido a la carpeta de pruebas durante la tarea, queda en `NEEDS_REVIEW` por totales declarados y saldo; no depende de este cambio. Despliegue: worker, API (`PROFILE_VERSION=statements-2026.10.17.3`) y frontend.

## 2026-10-17 — Excel BBVA comparado con otra herramienta: encabezado, tipo de fila y nombre del archivo

- Contexto: el responsable del producto comparó el Excel BBVA con el de otra herramienta sobre tres documentos (corriente en soles y en dólares, ahorro en soles) y pidió, uno por captura, los cambios de esta entrada. Solo se hicieron esos; los demás bancos conservan su libro.
- Hecho: `Resumen` empieza por `Archivo` (nombre del PDF) y `Tipo de cuenta` (`AHORRO`/`CORRIENTE`) y ya no lleva estado, extractor, versión ni confianza. `Movimientos` incluye el saldo anterior como primera fila y la columna `Tipo de fila` (`SALDO_ANTERIOR`/`MOVIMIENTO`); el conteo del `Resumen` lo incluye. `Control_Paginas` reemplaza palabras y filas visuales por filas y columnas extraídas por página. Nueva hoja `Encabezado`; se retiró `Validaciones`, cuyas invariantes siguen en la API y la interfaz.
- Hecho: lector puro de cabecera y pie (`bbva/header.py`) por rótulos. Separa por columna la dirección del ejecutivo, que comparten líneas, y admite el RUC pegado a su rótulo.
- Hecho: el nombre del PDF viaja de la API al worker como `source_file_name`, ya saneado. Ninguna estrategia lo ve: el trabajo lo escribe al publicar y lo incluye en su identidad, porque el directorio del worker se comparte por contenido entre personas.
- Hecho: el historial muestra el tipo de cuenta y ofrece el filtro Ahorro/Corriente cuando hay más de uno; el buscador también lo encuentra. Las descargas se guardan con el nombre del PDF (`Agosto.xlsx`, `Agosto_Movimientos.csv`); la API no cambia sus cabeceras.
- Decisión: ADR-0012. Versiones BBVA `0.3.0`, esquema 2 y perfil `statements-2026.10.17.2`.
- Verificación real autorizada, sin copiar contenido: los tres BBVA dan `SUCCEEDED` sin advertencias. Frente a la referencia coinciden hojas, número de filas (incluido el saldo anterior) y, fila a fila, tipo, página, fechas, `Cargo/Abono`, ITF y saldo; totales de ITF y saldo final también. En 8 conceptos de dos líneas cambia solo el orden de las palabras (el número de operación va antes de la segunda línea). En el `Encabezado` coinciden producto, titular, moneda, RUC, oficina, fecha y código de cuenta; la referencia arrastraba texto del pie en el CCI, mezclaba la dirección con el ejecutivo, recortaba la dirección y dejaba la hoja vacía. Prueba de carpeta real con los cinco PDF aprobada.
- Verificación automática: worker `scripts/check.ps1` (pytest con cobertura, Ruff, formato y mypy), API `npm run check` (186 aprobadas, 13 omitidas por requerir servicios) y frontend `npm run check` (242 aprobadas).
- Pendiente: despliegue a cargo del usuario, en orden worker, API (actualizar `PROFILE_VERSION` en Railway si está definida) y frontend. Repetir un PDF ya procesado con otro nombre conserva en el Excel el nombre original. Otros bancos no declaran tipo de cuenta ni encabezado. `Descripción` sigue incluyendo oficina, canal y número de operación, que la referencia separa en columnas.

## 2026-10-17 — Nombre original del PDF, arrastre funcional y persistencia privada

- Defecto reproducido con pruebas sintéticas: el formulario conocía el nombre del `File`, pero se descartaba después de procesar. La API conserva ahora `sourceFileName` como etiqueta privada del documento y la devuelve en carga, detalle e historial. La migración `20261017090000_statement_source_file_name` añade una columna nullable sin modificar documentos antiguos.
- Hecho: el nombre aparece al seleccionar o reemplazar un PDF, durante el procesamiento, en el resultado, junto al PDF original y en el historial; también forma parte de la búsqueda. Un nombre largo se ajusta al espacio disponible. En móvil, el estado queda separado del encabezado para no comprimir el nombre.
- Defecto corregido: arrastrar un archivo solo cambiaba el resaltado. Ahora actualiza el campo de React Hook Form y aplica la misma validación que el selector. La selección se bloquea durante el procesamiento para evitar que el nombre mostrado corresponda a otro archivo.
- Hecho: nombre enviado como campo de texto UTF-8 para preservar acentos frente a lectores multipart que interpretan `filename` como Latin-1. La API elimina rutas, controles y marcas bidireccionales, normaliza Unicode y limita a 255 caracteres. Repetir el mismo PDF con otro nombre actualiza solo la etiqueta, sin extracción ni cupo adicional, con filtro por organización y dueño.
- Privacidad: la etiqueta no entra en claves de objetos, rutas, nombres de artefactos, manifiestos del worker, logs, auditoría ni outbox; no se guarda en almacenamiento del navegador. Detalle e historial usan `private, no-store`. Decisión y límites documentados en ADR-0011 y en arquitectura, base de datos, despliegue y calidad.
- Verificación: frontend `npm run check` (229 pruebas), API `npm run check` (184 pruebas); migración aplicada a PostgreSQL local y 9 pruebas de aislamiento con base real, incluida persistencia UTF-8, recuperación tras consultas nuevas, renombrado por reutilización y ausencia del nombre en auditoría/outbox. Las pruebas nuevas de historial y persistencia fallaron antes de implementar el cambio. No se usaron documentos bancarios reales para esta tarea.
- Verificación visual: navegador con respuestas y archivo sintéticos, selección y envío, recarga del resultado e historial a 1366 y 375 píxeles; capturas inspeccionadas y ausencia de desbordamiento horizontal. Se corrigió el ancho mínimo del encabezado tras detectar el problema con un nombre largo sin espacios.
- Pendiente: despliegue a cargo del usuario. Actualizar primero la API para aplicar la migración y después el frontend. Los nombres antiguos nunca guardados se recuperan al volver a subir el mismo PDF; no se inventan ni se reconstruyen a partir de contenido bancario.

## 2026-10-17 — Regresión real de cinco estados, despliegue y versiones trazables

- Investigación: el único trabajo conservado de la cuenta de prueba tenía las cinco invariantes BBVA aprobadas y `BBVA_ROW_UNCLASSIFIED`. Los registros disponibles no mostraban errores de servicio. Railway todavía ejecutaba las estrategias anteriores a las correcciones del 14 de octubre; se desplegaron las correcciones ya existentes, sin silenciar advertencias ni alterar las reglas financieras.
- Defecto adicional reproducido con pruebas sintéticas: la versión usada para la idempotencia era distinta de la anunciada por el detector, el manifiesto, la API y el Excel. Cada estrategia toma ahora la versión de su detector, como única fuente. Versiones nuevas para invalidar los resultados anteriores: BBVA `0.2.1`, BCP `0.3.2`, Banco de la Nación y respaldo genérico `0.2.1`; Interbank conserva `0.1.0`. Perfil por defecto, ejemplo y producción actualizados a `statements-2026.10.17`.
- Hecho: prueba optativa de carpeta mediante `RUN_REAL_STATEMENTS=1` y `REAL_STATEMENTS_DIRECTORY`. Descubre los PDF sin fijar nombres personales, exige reconciliación sin advertencias y publica XLSX/CSV temporales con reapertura y comparación de celdas. Los errores del lector se ocultan para no revelar contenido bancario. No se incorporaron documentos reales a fixtures ni al control de versiones.
- Verificación real autorizada: cinco documentos, correspondientes a Banco de la Nación corriente en soles, BCP ahorro en soles y BBVA corriente en soles, corriente en dólares y ahorro en soles. Todos reconciliados localmente y mediante cargas autenticadas en Railway. Los cinco Excel y veinte CSV descargados coinciden con sus planes locales. El BBVA afectado conserva fechas, importes, ITF y saldos del Excel publicado anteriormente, y queda sin advertencias. En ahorro BBVA, el total ITF opcional permanece no evaluado porque no se declara.
- Verificación de producción: worker desplegado antes de API; ambas versiones definitivas activas. Repetir la carga BBVA reutiliza el resultado corregido. La retención deja los tres BBVA en el historial con estado correcto; se conservaron localmente las salidas verificadas de los cinco documentos, fuera del repositorio.
- Verificación automática: worker `scripts/check.ps1` (315 aprobadas, 7 omitidas de caracterización optativa, cobertura 93,14 %, Ruff, formato y mypy); prueba de carpeta real aprobada; API `npm run check` (175 aprobadas, 12 omitidas por requerir servicios); frontend `npm run check` (224 aprobadas). Las pruebas nuevas de versiones fallaron antes de corregirse.
- Limitación: la carpeta indicada solo contenía PDF, sin un Excel prototipo independiente; el contraste anterior/posterior usó el Excel previamente publicado de la cuenta de prueba. Las muestras verificadas no prueban otras variantes bancarias ni ahorro BBVA en dólares. Los resultados históricos de otros usuarios no se modificaron.

## 2026-10-14 — BBVA con conceptos de dos líneas, BCP con cero explícito y diagnóstico seguro

- Investigación de producción: se consultaron los 8 trabajos conservados de Railway con selección explícita de códigos, estados y conteos, sin extraer identidades ni contenido financiero. Había cuatro reconciliados y cuatro en revisión. Dos revisiones correspondían a PDFs sintéticos de servicio con varias páginas que repetían el saldo inicial y final de una página independiente: su descuadre global es real y no se suprime. Los otros dos eran el BBVA del administrador y un BCP de usuario.
- Defecto BBVA reproducido y corregido: tres continuaciones de descripción contenían un decimal y se marcaban como `BBVA_ROW_UNCLASSIFIED` aunque todos los controles financieros pasaban. Se conserva el texto como parte del movimiento anterior solo si la línea es contigua, está dentro de la columna de descripción delimitada por la cabecera, conserva la página y contiene texto. Se siguen advirtiendo importes fuera de esa columna, líneas huérfanas, lejanas o de otra página. Estrategia `0.2.0`.
- Defecto BCP reproducido y corregido: un cargo explícito de cero fallaba en `BCP_MOVEMENT_AMOUNTS`, aunque los totales y el saldo del documento cuadraban. Se distingue cero de ausencia: se admite un cero en una sola columna con la otra ausente; dos columnas cero, importes ausentes, negativos o simultáneos siguen sujetos a las validaciones existentes. Estrategia `0.3.1`.
- Verificación real: las funciones corregidas se ejecutaron en un proceso aislado dentro del worker de Railway sobre los originales allí almacenados, sin modificar el servicio activo ni los trabajos publicados. El BBVA y el BCP afectados pasan a `SUCCEEDED` sin advertencias; los casos ya correctos siguen correctos y los dos sintéticos inconsistentes conservan su aviso. Los documentos no se descargaron a la máquina local. Se retiraron el proceso de diagnóstico y la clave SSH temporal; PostgreSQL siguió privado.

- Defecto corregido: la descarga principal de Excel ocultaba su error, aunque las descargas secundarias sí lo mostraban. Ahora presenta el mensaje correspondiente y permite reintentar.
- Defecto corregido: cualquier `NEEDS_REVIEW` afirmaba que las cifras no reconciliaban, incluso cuando solo había advertencias y ninguna invariante fallida. El resumen distingue verificaciones fallidas de advertencias o comprobaciones pendientes; conserva el estado de revisión.
- Hecho: las solicitudes de procesamiento fallidas dejan `statement.request_failed` en auditoría, con organización, actor, referencia, código y tamaño. No guardan nombre de archivo, contraseña, mensaje de excepción ni contenido bancario. Si falla la auditoría, se conserva el error original y se registra un código seguro.
- Defecto corregido: el filtro HTTP registraba trazas completas para errores internos y no registraba rechazos 4xx. Ahora registra referencia, estado HTTP, código y rol, sin trazas ni mensajes privados; solo acepta códigos con formato controlado. Esto cubre solicitudes de usuarios y administradores, incluidas las de gestión de usuarios.
- Defecto corregido: tras `git pull` en Windows, 24 archivos del frontend quedaban con CRLF y rompían `format:check`. Se normalizaron sin cambios de contenido y se fijó LF para TypeScript y CSS en `.gitattributes`.
- Verificación: frontend `npm run check`; API `npm run check` (175 pruebas, 12 omitidas por requerir servicios); worker con pytest (314 pruebas, 6 omitidas de caracterización local real, cobertura 93,14 %), Ruff, formato y mypy. Los casos nuevos fallaron antes de corregirse. El fixture BBVA con continuación se renderizó y se revisó visualmente. Se prueban ambos roles y que un fallo de auditoría no sustituya el rechazo original.
- Hecho: perfil por defecto y ejemplos actualizados a `statements-2026.10.14` para permitir nuevas conversiones con los extractores corregidos. El despliegue debe actualizar también la variable si ya estaba definida.
- Limitación: los documentos eliminados por retención y los rechazos antiguos sin auditoría no pueden reconstruirse con el historial conservado. No se afirma haber recuperado errores que nunca se guardaron.
- Pendiente: desplegar primero el worker y después la API con el perfil nuevo, y volver a procesar los documentos afectados. Los resultados históricos publicados no se modificaron durante esta revisión.

## 2026-10-11 — Logos sin fondo de color, y el del Banco de la Nación visible

- Hecho: los logos de los bancos van solos, sin recuadro de color por banco (Historial, detalle del día del Calendario) ni gris (Cuentas consolidadas). El hueco conserva su tamaño para que la columna siga alineada. `badgeClassName` sale de `BANK_ACCENTS`, que ya no tenía otro uso.
- Defecto corregido: el logo del Banco de la Nación estaba bien importado, pero es el logotipo completo con el nombre (2339 × 501, casi 5:1) y en un hueco de 36 × 24 px quedaba de unos 6 px de alto. Se recortó el símbolo a `assets/banks/nacion-simbolo.png` (cuadrado, fondo transparente) y es el que se usa; `nacion.png` (el logotipo completo) se usa en el selector de banco de la carga, donde el hueco es apaisado: ese selector tiene su propia lista de logos (`bank-selector.tsx`) y ahí el banco seguía con `logo: null` e ícono neutro. Lleva `wideLogo` para ocupar 160 px en vez de 80; a 80 quedaba de 17 px de alto.
- Verificación: tipos, ESLint y Vitest del frontend en verde; capturas con Playwright y API simulada.

## 2026-10-11 — El resumen del Calendario dice con qué saldo abre el mes

- Hecho: la franja bajo el Calendario se lee como la cuenta que es: Periodo (`1 – 31 ago.`) · Saldo inicial · Entradas · Salidas · Saldo final. El saldo inicial es el mismo que arrastra la vista Balance (`computeBalanceBeforeMonth`: el cierre del mes anterior o el inicial declarado del documento más antiguo de cada banco), ahora expuesto como `openingBalanceCents` en `MonthSummary`. «Balance al 31 ago.» pasa a «Periodo» y «Saldo» a «Saldo final».
- Hecho: en móvil siguen a la vista periodo y saldo final; el chevron despliega saldo inicial, entradas y salidas en filas (rótulo a la izquierda, importe a la derecha) en vez de tres columnas donde los importes se cortaban.
- Verificación: tipos, ESLint y Vitest del frontend en verde; capturas con Playwright y API simulada a 1366, 1024 y 375 px.

## 2026-10-11 — Buscador en el Calendario y flujo negativo en rojo suave

- Hecho: el Calendario tiene el mismo buscador que el Centro Financiero (descripción y categoría, `filterBySearch`). En Flujo cada día muestra solo el neto de lo encontrado; en Balance el saldo no cambia. En los dos, los días sin coincidencias se atenúan, el detalle del día lista solo lo que coincide y bajo el buscador se lee «N movimientos coinciden · neto ±S/ …». El resumen del mes y los saldos siguen siendo los de las cuentas: un saldo calculado solo con lo encontrado no sería el de ninguna.
- Hecho: en Flujo, el neto negativo de un día va en rojo suave (`text-destructive/75`) en vez de gris; el rojo pleno sigue reservado al saldo en contra en Balance.
- Verificación: tipos, ESLint y Vitest del frontend en verde, con pruebas nuevas del buscador; capturas con Playwright y API simulada a 1366 y 375 px.

## 2026-10-10 — El periodo del Centro Financiero, arriba y a la vista; filtro de moneda en el Historial

- Hecho: el selector de mes del Centro Financiero estaba al pie de la tarjeta del flujo neto, pequeño y sin rótulo. Ahora va arriba, encima de los filtros de banco, con el mismo encabezado que el Calendario: rótulo «Periodo», el mes en grande y las flechas de anterior y siguiente al lado. El mes abre un panel propio (Radix Popover, ya no el `<select>` nativo) con los doce meses de cada año que tiene documentos: los que tienen se eligen, el actual va resaltado y recibe el foco, y los demás se ven atenuados. `MonthPaginator` pasa a `PeriodPicker` (`period-picker.tsx`) y `NetFlowHero` deja de recibir el mes. Se probó antes un bloque con chips de meses; se descartó por pesado.
- Defecto evitado: sin ningún documento legible el mes llega vacío y `getMonthLabel('')` lanzaba; el encabezado ahora dice «Sin periodo».
- Hecho: el Historial filtra por moneda («Todas · S/ Soles · US$ Dólares») junto al buscador. Solo aparece si los documentos listados tienen más de una moneda; un documento sin moneda conocida (fallido o aún cargando) sale al elegir una.
- Verificación: tipos, ESLint y Vitest del frontend en verde, con pruebas nuevas del filtro de moneda; capturas con Playwright y API simulada a 1366 y 375 px.

## 2026-10-10 — El Historial dice el mes y la moneda de cada documento, y tiene buscador

- Hecho: bajo el nombre del banco, cada fila muestra el periodo y la moneda del documento («Julio de 2026 · US$ Dólares»), para distinguir dos del mismo banco. Se leen de los CSV publicados con la misma consulta y la misma caché que el Centro Financiero y el Calendario (`useFinancialStatements`), así que abrir esas vistas después no vuelve a descargar nada. Un documento sin archivos (fallido) no tiene periodo que mostrar.
- Hecho: buscador de texto sobre lo que se ve en la lista: banco, mes, moneda, estado, fecha y movimientos. No distingue tildes ni mayúsculas y exige todas las palabras («setiembre soles»). Filtra en el navegador: no consulta la API.
- Hecho: las etiquetas de estado pasan a `components/shared/status-labels.ts` para que el buscador use el mismo texto que el badge.
- Verificación: tipos, ESLint y Vitest del frontend en verde; capturas con Playwright y API simulada a 1366 y 375 px.

## 2026-10-10 — El Historial muestra el banco de cada documento

- Hecho: cada fila del Historial empieza con el logotipo y el nombre de su banco, sacados del `extractorId` que ya traía `/v1/jobs`. Los bancos sin logotipo (Banco de la Nación, «Otro banco») usan el ícono neutro de siempre.
- Hecho: la casilla para incluir el documento en el análisis deja de ser la nativa del navegador: cuadrada, rellena con el color primario y un check blanco al marcarla, con área de clic de 32 px. Sigue siendo un `<input type="checkbox">`, así que el teclado y los lectores de pantalla no cambian.
- Verificación: tipos, ESLint y Vitest del frontend en verde; capturas con Playwright y API simulada a 1366 y 375 px.
- Pendiente: logotipo del Banco de la Nación. Va en `frontend/src/assets/banks/` y se enlaza en `BANK_ACCENTS` (`frontend/src/features/financial-center/bank-accent.ts`).

## 2026-10-10 — El Calendario pinta cada día con el símbolo de su moneda

- Hecho: las celdas del Calendario muestran el importe con su moneda, igual que el resumen del mes: `+S/ 18.09`, `−US$ 300.00`. En celdas estrechas se quita el símbolo (el selector ya dice la moneda) y desde mil se redondea (`66.4K`), como antes.
- Hecho: [`docs/arquitectura/monedas.md`](../arquitectura/monedas.md) reúne las monedas admitidas (`PEN` y `USD`), su formato, cómo la detecta cada banco y qué tocar para añadir otra.
- Verificación: frontend con tipos, ESLint y Vitest en verde.

## 2026-10-06 — Prueba de punta a punta como persona, y el ITF contado dos veces

- Hecho: la aplicación entera levantada en local (worker, API, PostgreSQL y frontend) y recorrida como lo haría una persona, con los cinco PDF reales de `referencias/`, copias suyas protegidas con contraseña (AES-128, RC4-128 y AES-256, como llegan por correo), PDF sintéticos de los cinco extractores y archivos que no son estados de cuenta. 24 subidas por la API y 40 comprobaciones en el navegador: un administrador da de alta a una persona, ella entra, sube, ve el detalle, descarga Excel y CSV, marca en el Historial, consolida en el Centro Financiero y el Calendario en soles y en dólares, a 1366 y 360 px, y el cupo de 3 retira el más antiguo al subir el cuarto.
- Verificado: un PDF real protegido pide la contraseña, rechaza la equivocada y con la correcta da el mismo resultado que el original (15,990 movimientos del BCP, 60 del BBVA); repetirlo reutiliza el trabajo. Los cinco reales terminan en `SUCCEEDED` sin advertencias. Vacío y no-PDF se rechazan en el navegador o con `UNSUPPORTED_MEDIA_TYPE`; un PDF roto, con `INVALID_PDF`. Sin desbordes de página ni de celdas. Registros de la API, el worker y el frontend sin errores.
- Defecto corregido: **el Centro Financiero contaba dos veces el ITF del BBVA.** Los totales del `Resumen` del BBVA ya traen el ITF de cada fila restado (los calcula el worker; el banco no los imprime), y la interfaz le sumaba además el `Total ITF`: con el documento real, inicial + entradas − salidas quedaba 5.75 por debajo del saldo final. Ahora, si las filas traen ITF, entradas y salidas se suman desde las filas, igual que el Calendario y la lista de movimientos. La prueba del frontend tenía el mismo error en su CSV de ejemplo; se rehízo con lo que el worker publica de verdad.
- Hallazgo: el Banco de la Nación **no declara la moneda** en ninguna parte de su primera página (ni `MONEDA`, ni `SOLES`, ni `S/`), así que su `Resumen` sale sin moneda y la interfaz lo trata como soles. Correcto para la muestra (cuenta en soles); una cuenta en dólares del banco se vería en soles.
- Hallazgo: `frontend/.env.local` dirige el proxy de Vite a la **API de producción**. Un `ejecutar.ps1` levanta el frontend local contra producción, no contra la API local; para probar en local hay que arrancar Vite con `VITE_API_PROXY_TARGET=http://127.0.0.1:3000`.
- Verificación: frontend `npm run check` en verde (214 pruebas).
- Despliegue: `eecc-api` redesplegada con `railway up` desde `2f8776a`; el worker no cambió. Sirve el mismo bundle que el build local (`index-BT9cEykq.js`, antes `index-BVxuayhE.js`); `/health` 200 y `/v1/jobs` sin sesión 401.
- Pendiente: revisar en la base de producción qué probaron las personas; esta sesión no tuvo permiso para leerla.

## 2026-10-06 — PDF protegidos, BBVA y Banco de la Nación en la carga, y dólares con su signo

- Defecto corregido: un estado de cuenta del BCP enviado por correo (`EECC…PDF`) fallaba en las pruebas con «El documento no pudo leerse como PDF». No se pudo ver el documento —la API no guarda los rechazos del worker y este no registra el motivo, a propósito—, pero el fallo se reprodujo con un PDF sintético: **un PDF con contraseña de apertura** hace fallar a pdfminer con la misma excepción que uno corrupto, y el worker lo traducía a `INVALID_PDF`. Las cinco muestras de `referencias/` que sí funcionan no tienen cifrado.
- Hecho: el worker abre el PDF protegido con `pypdfium2` (ya llegaba con `pdfplumber`) y entrega a las estrategias una copia descifrada que se borra con la subida. Sin contraseña responde `PDF_PASSWORD_REQUIRED`; con una que no lo abre, `PDF_PASSWORD_INCORRECT`. La contraseña viaja como `pdfPassword` (API) y `pdf_password` (worker), máximo 128 caracteres; **no se guarda, no se registra ni entra en la clave de idempotencia**. La identidad del trabajo se calcula sobre el original, porque la copia descifrada cambia en cada descifrado.
- Hecho: la carga tiene un campo opcional «Contraseña del PDF». Si el worker la pide, el campo se marca, recibe el foco y dice qué hacer; una contraseña equivocada tiene su propio mensaje.
- Hecho: el selector de banco ofrece **BBVA y Banco de la Nación** (este con ícono neutro y su nombre, sin imitar su logotipo). Scotiabank sigue en «Próximamente»: no hay muestra ni extractor. El texto «Por ahora se procesan…» sale de la lista y no se repite a mano.
- Defecto corregido: **un estado de cuenta del BBVA se veía sin un solo movimiento** en el Centro Financiero y el Calendario, y como «Otro banco». Su CSV usa `Cargo/Abono` con signo, `Fecha oper.`, `Saldo anterior` y `Saldo contable final`, rótulos que el frontend no conocía, y `bbva-account-v1` faltaba en la tabla de extractores. El ITF se muestra como movimiento aparte y suma a las salidas: sin él, inicial + entradas − salidas no llegaba al saldo final del banco.
- Hecho: cada estado de cuenta lleva su moneda (columna `Moneda` del `Resumen`) y los importes se pintan con `S/` o `US$` puestos a mano, porque `Intl` escribe el dólar distinto en cada motor. El Calendario y el Centro Financiero consolidan **una moneda a la vez**: con solo soles o solo dólares no hay nada que elegir; con las dos aparece un selector «S/ Soles · US$ Dólares» y se empieza por soles. Un documento sin moneda declarada se trata como soles.
- Hecho: el BCP publica su moneda. Se lee del código de cuenta de la cabecera (`191-12345678-0-11 SOLES`) o de `MONEDA:`, y va **al final** del `Resumen` para no mover las columnas existentes. La estrategia pasa a `0.3.0`, así que el worker no reutiliza resultados BCP sin moneda. Contra las tres muestras reales del BCP detecta `PEN` (solo se imprimió el código).
- Hecho: los códigos `BBVA_*` de advertencias e invariantes tienen su explicación en el resumen del trabajo.
- Verificación: `pdf-worker scripts/check.ps1` en verde (309 pruebas, 93 % de cobertura, Ruff y mypy), con nuevas sobre PDF sintéticos cifrados: sin contraseña, equivocada, correcta, solo permisos de propietario, contenido que no es PDF, reutilización del trabajo y que la respuesta no lleva la contraseña. `api-backend npm run check` en verde (168), con la contraseña reenviada al worker, ausente de lo persistido y rechazada si pasa de 128. Frontend `npm run check` en verde (213 pruebas, 94,87 %), con el BBVA leído contra sus cabeceras reales, el ITF, la moneda y el selector en las dos vistas, y el reintento con contraseña. Capturas con Playwright y API simulada a 1366 y 375 px.
- Despliegue: `eecc-worker` y `eecc-api` redesplegados con `railway up` desde `7e41597`, el worker primero porque la API ya espera sus códigos nuevos. La imagen del worker instaló `pypdfium2` 5.14 y arrancó sin errores. La API sirve el mismo bundle que el build local (`index-BVxuayhE.js`, antes `index-DyPtTLRL.js`), con los textos nuevos (`Contraseña del PDF`, `PDF_PASSWORD_REQUIRED`, `bbva-account-v1`, `US$`); `/health` 200 y `/v1/jobs` sin sesión 401. Vercel no se comprobó: su URL pide sesión de Vercel.
- Pendiente: los rechazos del worker no dejan rastro. La API responde el error antes de guardar nada y el worker no registra el motivo, así que la referencia de una captura no lleva a ninguna parte. Registrarlos como evento de auditoría (código, referencia, persona y tamaño; sin contenido ni nombre de archivo) permitiría reconstruir una prueba fallida.
- Pendiente: confirmar con el PDF real que falló que el motivo era la contraseña. Si abre sin pedirla, el fallo es otro y hará falta el archivo para reproducirlo.
- Pendiente: los BCP ya procesados no traen moneda y se muestran en soles hasta que se vuelvan a subir.

## 2026-10-01 — El Calendario muestra los importes con dos decimales

- Defecto corregido: la celda redondeaba a soles enteros y **no cuadraba con su propio detalle**: un día con neto −15.49 se pintaba `−15`, y el saldo `4.21` del resumen salía `4` en la celda.
- Hecho: la celda pinta el importe con dos decimales (`−15.49`, `66,387.45`). Solo se redondea a compacto (`66.4K`, `1.23M`, tres cifras significativas) cuando el importe pasa de mil soles y no cabe; por debajo de mil nunca se compacta.
- Decisión: el formato lo elige **el ancho de la celda y no el de la pantalla** (container queries de Tailwind). Con `sm:` la celda medía 55 px entre 768 y 1023 px por el menú lateral, y `−66,387.45` se cortaba. En un móvil de 360 px la celda mide 35 px: ahí el importe baja a 9 px y letra apretada para que `−999.99` quepa.
- Verificación: frontend `npm run check` en verde (195 pruebas), con pruebas nuevas del formato (`cell-amount.test.ts`) y de la celda en las dos vistas. Medido en navegador con datos sintéticos de 360 a 1600 px y saldos de millones: ningún importe se sale de su celda.
- Despliegue: `eecc-api` redesplegada con `railway up` desde `6146112` (`SUCCESS`); el worker no cambió. Railway sirve el mismo bundle que el build local (`index-DyPtTLRL.js`, antes `index-C_bYAOng.js`) y su CSS trae las container queries; `/health` 200 y `/v1/jobs` sin sesión 401. Vercel marca el commit como desplegado en Production, pero la URL del despliegue pide sesión de Vercel y el bundle de ahí no se pudo comparar.
- Pendiente: el resumen del mes (`Saldo`, `Entradas`) se trunca con `…` a 800 px cuando los importes llegan a millones; no es de la celda y no se tocó.

## 2026-09-30 — El Calendario usa los documentos reales y la selección pasa al Historial

- Defecto corregido: el *Calendario* **seguía pintando `mock-transactions.ts`**. Con un único estado de cuenta de agosto, mostraba setiembre con saldos de −S/ 2 millones que no eran de nadie: «no está sincronizado» con el Centro Financiero porque nunca leyó lo mismo.
- Hecho: el Calendario lee los estados de cuenta del historial igual que el Centro Financiero (los CSV publicados, `ADR-0010`), abre en el mes más reciente con datos y solo navega entre el primero y el último.
- Decisión: el saldo diario **arranca en el saldo inicial que declara el documento más antiguo de cada banco** y se arrastra sumando movimientos. Sumar el inicial de cada documento lo duplicaría (el inicial de setiembre es el final de agosto). Antes arrancaba en cero.
- Decisión: la elección de documentos **sale del Centro Financiero y pasa al Historial**, como un check por fila; las dos vistas consolidan directamente lo marcado. Se guardan los *excluidos* en `localStorage` por persona —solo identificadores de trabajo, nunca importes—, así que un documento nuevo entra solo. Solo se ofrece el check en documentos con archivos publicados.
- Hecho: estados propios en las dos vistas: sin documentos (subir uno) y ninguno marcado (ir al Historial). Se retiraron `statement-selector.tsx` y `mock-transactions.ts`.
- Verificación: frontend `typecheck`, `lint`, build y 190 pruebas con 94,28 % de cobertura. Nuevas: el Calendario de extremo a extremo con `fetch` simulado (mes del documento, días con movimientos, saldo 1000 + 500 − 200), el arrastre desde el saldo inicial con dos bancos, el check del Historial y que desmarcarlo todo deja las dos vistas remitiendo allí.
- Despliegue: `eecc-api` redesplegada con `railway up` desde `7a14d4f` (`SUCCESS`); el worker no cambió. Railway y Vercel sirven el mismo bundle que el build local (`index-C_bYAOng.js` en Railway, con los textos nuevos también en Vercel); `/health` 200 y `/v1/jobs` sin sesión 401. Ojo: la raíz responde 404 a un `curl` sin `Accept: text/html`; es el respaldo de la SPA, no una caída.
- Pendiente: la selección vive en el navegador; en otro equipo vuelve a estar todo marcado.

## 2026-09-23 — Producción con BBVA, Banco de la Nación y el Centro Financiero real

- Hecho: `eecc-worker` y `eecc-api` redesplegados con `railway up` desde `972f22c`, con el árbol limpio y sincronizado con `origin/main`. Las dos imágenes se construyeron y publicaron; el worker arrancó sin errores y escucha en el 8000.
- Contexto: producción llevaba desde el 15 de septiembre con el código de `1790f5f`. **Railway no despliega desde GitHub**: hasta este `railway up`, todo lo de los dos últimos días estaba en el repositorio y en ninguna otra parte. Un PDF del Banco de la Nación o del BBVA seguía fallando entero en producción, y el Centro Financiero seguía mostrando datos inventados.
- Verificación: `/health` responde `ok` y `/v1/jobs` sin sesión responde `401`. El bundle servido cambió de `index-jc29LJge.js` a `index-D8SLGor6.js` —el mismo hash que produce el build local— y contiene los textos nuevos del Centro Financiero (`Elegir otros documentos`, `Banco de la Nación`, `Otro banco`), que antes no estaban.
- Sin migraciones pendientes: los extractores nuevos no cambian el esquema. `bbva-account-v1` (15 caracteres) cabe en `extractor_id` (64) y `BBVA_DUPLICATE_OPENING_BALANCE` (30) en `code` (64). La última migración sigue siendo la del 12 de septiembre.
- Sin cambios en la API: no hay lista blanca de extractores, `extractorId` viaja como texto hasta el registro del worker.
- Pendiente: **no se comprobó el worker desplegado por dentro.** No tiene dominio público y `railway ssh` pide una clave SSH que no existe en esta máquina, así que `/internal/extractors` no se pudo consultar. Que la imagen trae los extractores nuevos se deduce de que se construyó desde este árbol, no de haberlo visto responder.
- Pendiente: sigue sin subirse un documento real en producción; no hay contraseña de ninguna cuenta de ahí.

## 2026-09-22 — Estados de cuenta del BBVA

- Hecho: nuevo extractor `bbva-account-v1`, construido **midiendo un estado de cuenta real** (cuenta corriente en dólares, 2 páginas) en vez de suponer la plantilla. Antes ese documento caía al respaldo genérico y fallaba entero: `FAILED`, cero filas, `GENERIC_ROW_WITHOUT_DATE`. Ahora da `SUCCEEDED` con 60 movimientos y las cinco invariantes en `PASSED`.
- Decisión: **el ITF descuenta del saldo**, aunque el banco lo imprima en columna aparte. No se dedujo, se midió: `saldo = anterior + cargo` cuadra 31 veces y falla 28; `saldo = anterior + cargo - itf` cuadra 59 y falla 0. La ecuación con impuesto es la que el documento demuestra.
- Decisión: `CARGO/ABONO` es **una sola columna con signo**, así que la fila guarda `amount` tal como lo imprime el banco y deriva cargo y abono como propiedades. Perder el signo original habría obligado a reconstruirlo después.
- Hecho: las fechas son `dd-mm` **sin año** y el documento no declara periodo. El único año está en la fecha de emisión del pie: un mes posterior al de emisión pertenece al año anterior, que es lo que fecha bien un periodo que cruza diciembre. Sin esa fecha ni `default_year`, la fila se señala con `BBVA_DATE_WITHOUT_YEAR`.
- Defecto evitado: las columnas se aprenden **solo del bloque de cabecera**. Aprendiendo de cualquier fila, el `SALDO` del título («MOVIMIENTO Y SALDO A LA FECHA», impreso a la izquierda) se tomaba por la columna de saldo, que está al otro extremo de la página: el resultado eran cero movimientos sin ningún error visible.
- Decisión: los importes de una fila se reparten **por orden** de columna y no por cercanía al rótulo. `CARGO/ABONO`, `ITF` y `SALDO` están a pocos puntos y el rótulo más cercano se decidía por un margen de 3, que cambia con el tamaño de la fuente: el PDF sintético fallaba donde el real funcionaba. La geometría se conserva para **comprobar** el reparto, no para decidirlo.
- Hecho: Excel con esquema `eecc.statement.bbva` (`Resumen`, `Movimientos` con `Cargo/Abono` con signo e `ITF` en columna propia, `Control_Paginas`, `Validaciones`) y un CSV por hoja. No exporta titular, documento ni número de cuenta.
- Hecho: la cabecera del documento ocupa **tres líneas**, así que los rótulos se buscan sueltos: en el texto plano `SALDO CONTABLE` y `FECHA VALOR` nunca aparecen juntos. Y la marca del banco solo sobrevive dentro de `WWW.BBVABANCOCONTINENTAL.COM`, donde `BBVA` no casa.
- Verificación: `pdf-worker scripts/check.ps1` en verde (290 pruebas, 93,11 % de cobertura, Ruff y mypy), con 10 nuevas sobre un PDF sintético que reproduce la plantilla: saldo roto, totales de ITF que no cuadran, bloque de cierre ausente, documento sin año, y que no reclama documentos de BCP, Interbank ni Banco de la Nación. La caracterización con `RUN_REAL_STATEMENTS=1` pasa contra el documento real.
- Hecho: comprobado que **la lectura no depende de la divisa**. Los importes se imprimen sin símbolo y la moneda se declara una sola vez, en `MONEDA:`; una prueba genera el mismo documento sintético en soles y en dólares y exige idéntico resultado, con la etiqueta `PEN` o `USD` en el Excel.
- Pendiente: la muestra real es **una cuenta corriente en dólares de dos páginas**. Lo que puede cambiar en una cuenta de ahorro, en soles o de más páginas no es la divisa sino la plantilla —otras columnas, otro cierre— y eso solo lo dirá una muestra.
- Pendiente: **Scotiabank** sigue sin muestra y sin extractor.
- Pendiente (interfaz): los códigos `BBVA_*` no tienen explicación en `warning-list.tsx`, que sí traduce los de Interbank y Banco de la Nación. Un trabajo de BBVA con advertencias mostraría el código crudo en vez de una frase.
- Pendiente (interfaz): el selector de banco de la carga sigue marcando BBVA como «Próximamente» y sin ofrecer Banco de la Nación; como el worker detecta solo, un PDF de cualquiera de los dos ya se procesa igual.

## 2026-09-22 — Banco de la Nación, validado con un documento real

- Defecto corregido: `banco-nacion-v1` **no reconocía un estado de cuenta del propio banco**. Se escribió sin muestra, adivinando la plantilla, y contra el documento real (144 páginas) sacaba confianza 0,25 frente a un mínimo de 0,75. Caía al respaldo genérico, que fallaba entero: `FAILED`, cero filas, `GENERIC_HEADER_NOT_RECOGNISED`. Hoy da `SUCCEEDED` con 7.450 movimientos y las cinco invariantes en `PASSED`, en 4 segundos.
- Hecho: la detección deja de exigir el nombre del banco. **El documento no lo menciona en ninguna parte** —cabecera, pie ni metadatos—, así que el techo de confianza alcanzable era 0,60 y ningún documento real podía pasar. La firma pasa a ser estructural: `CODIFICACION` (0,35), `SALDOS DIA` (0,20), `NRO CHEQUE` (0,10), más el formato de cuenta y `SALDO ANTERIOR`. La marca sigue sumando 0,45 cuando está. Comprobado que ni BCP, ni Interbank, ni el BBVA real quedan reclamados por error.
- Hecho: la fecha se busca **por su columna**, no por abrir la fila. El banco la imprime en la última (`DIA`). Sin cabecera que la nombre se mantiene la convención anterior, así que las dos disposiciones conviven.
- Hecho: el saldo se imprime **una vez por día** (`SALDOS DIA`), no por movimiento: de ~280 filas muestreadas, 3 lo traían. La reconciliación ya lo admitía —compara solo donde hay saldo impreso y arrastra el resto—, así que no hubo que tocarla; lo que faltaba era leer bien las filas.
- Hecho: el cierre va en **dos líneas** (`TOTAL | TOTAL CARGOS | TOTAL ABONOS | SALDO ACTUAL` arriba, importes alineados debajo) y el saldo final lleva **relleno de asteriscos** (`*********12,345.67`). Sin lo primero el cierre quedaba sin leer; sin lo segundo el importe no coincidía con ningún patrón. Las dos cosas eran la diferencia entre `NEEDS_REVIEW` y `SUCCEEDED`.
- Decisión: `CODIFICACION` entra como rótulo de detalle y `SALDOS` como columna de saldo; `_is_header` pregunta por el **papel** de cada rótulo y no por una palabra concreta. Así la misma tabla se reconoce rotulada `FECHA ... DESCRIPCION ... SALDO` o `CODIFICACION CARGOS ABONOS SALDOS DIA`.
- Verificación: `pdf-worker scripts/check.ps1` en verde (280 pruebas, 93,64 % de cobertura, Ruff y mypy), con 7 nuevas sobre un PDF sintético que reproduce la plantilla real —fecha a la derecha, saldo por día, cierre a dos líneas, asteriscos, sin nombre del banco— incluidas las de que un saldo diario alterado deja `NEEDS_REVIEW` y que no reclama documentos de otros bancos. La caracterización con `RUN_REAL_STATEMENTS=1` pasa contra el documento real; **contra el código anterior ese caso falla**. Las 35 pruebas de la plantilla anterior siguen verdes: no se retiró, cubre otra disposición válida.
- Pendiente: la muestra es **cuenta corriente en soles**. Ahorro y dólares pueden cambiar la plantilla; hay que confirmarlos antes de darlos por soportados.
- Pendiente: **BBVA**. Hay muestra real (cuenta corriente en dólares, 2 páginas) y hoy el documento acaba en el respaldo genérico con `FAILED` y `GENERIC_ROW_WITHOUT_DATE`. No existe extractor. De Scotiabank no hay muestra.
- Pendiente: en la interfaz, el selector de banco de la carga sigue sin ofrecer Banco de la Nación; como el worker detecta solo, un PDF suyo se procesa igual aunque se elija otro.

## 2026-09-22 — El Centro Financiero deja de ser una demo

- Hecho: el *Centro Financiero* ya no muestra los datos simulados de `mock-transactions.ts`. La preselección lista el **historial real** de quien entra (`GET /v1/jobs`, solo documentos con artefactos publicados) y, al consolidar, el navegador descarga los CSV de `Movimientos` y `Resumen` de cada trabajo elegido y arma con ellos los saldos, totales y movimientos.
- Decisión: **no se añadió tabla de movimientos ni endpoint nuevo.** Los archivos ya existen y su descarga ya está autorizada por persona y trabajo; la API sigue sin interpretar hojas de cálculo. Motivos y alternativas en [`ADR-0010`](../decisiones/ADR-0010-centro-financiero-lee-los-csv-publicados.md).
- Decisión: lo que el documento declara no se recalcula. Totales y saldo final salen del `Resumen`; el saldo inicial, del `Resumen` o de la fila `SALDO ANTERIOR` de BCP (que su resumen no imprime). Solo se deriva lo que ningún extractor declara. Los importes se leen como centavos enteros desde los dígitos del decimal, nunca con `Number(x) * 100`.
- Hecho: el banco de origen se amplía a `nacion` y `otro`. El worker detecta la plantilla por su cuenta, así que un estado de cuenta del Banco de la Nación —o uno resuelto por el respaldo genérico— ya se ve en el Centro Financiero, con un ícono neutro en vez de un logotipo que el proyecto no tiene. Los bancos listados salen de los documentos cargados: se acabaron las filas en cero de BBVA y Scotiabank.
- Hecho: un movimiento se marca conciliado si el saldo de su fila cuadra con el arrastre desde la anterior; un descuadre puntual no ensucia las filas siguientes. Sin columna de saldo no se marca ninguno.
- Hecho: estados propios de datos reales — historial cargando, sin documentos que consolidar (con enlace a subir uno), y aviso de cuántos documentos quedaron fuera del consolidado cuando alguno no se pudo leer.
- Verificación: frontend `typecheck`, `lint` y 197 pruebas con 94,95 % de cobertura. 40 pruebas nuevas: el lector de CSV (comillas, CRLF, BOM), los importes en centavos (incluido que mil sumas de `0.07` den exactamente `70.00`), y la construcción del estado de cuenta contra CSV sintéticos con las cabeceras reales de los cuatro exportadores. La página se prueba de extremo a extremo con `fetch` simulado: lista, detalle, descarga de los dos CSV y consolidado.
- Pendiente: **no se ha probado contra un documento real en el navegador.** Hace falta subir un estado de cuenta, consolidarlo y comprobar que los números coinciden con el Excel descargado.
- Pendiente: el *Calendario* sigue con los datos simulados; comparte tipos y acentos, así que le falta solo cambiar la fuente. `format:check` sigue fallando en 15 archivos ajenos por finales de línea CRLF en disco, no por su contenido.

## 2026-09-15 — Producción con Banco de la Nación y el calendario nuevo

- Hecho: `eecc-worker` y `eecc-api` redesplegados con `railway up` desde `1790f5f`; los dos en `SUCCESS`. La imagen de la API compila también el frontend, así que el dominio de Railway pasa a servir el Centro Financiero y el Calendario llegados desde `c9d0ae5`. Sin migraciones pendientes; el worker arrancó sin errores.
- Verificación: `/health` responde `ok`, `/v1/jobs` sin sesión responde `401`, y el bundle publicado contiene el calendario nuevo y los textos `BANCO_NACION_*`.
- Defecto de despliegue: Vercel había bloqueado `75f9e60` y `1790f5f` («Deployment was blocked») porque el repositorio volvió a estar privado y el plan Hobby no despliega commits de colaboradores en repositorios privados. Con el repositorio de nuevo público, este commit dispara el despliegue: los bloqueados no se reintentan solos.
- Pendiente: sigue sin subirse un documento en producción (no hay cuenta de prueba ahí).

## 2026-09-15 — Estados de cuenta del Banco de la Nación (sin muestra real)

- Hecho: nuevo extractor `banco-nacion-v1` en `pdf-worker`. **No hay ningún estado de cuenta real del banco en el repositorio**, así que no se copió una plantilla: la lectura se guía por lo que el documento declara. La cabecera de la tabla da la posición de cargos, abonos (o un importe con signo) y saldo; `SALDO ANTERIOR`, `SALDO FINAL`, `SALDO AL`, `TOTAL CARGOS`/`TOTAL ABONOS` y `TOTALES` se leen dentro de la tabla o en un resumen encima; `VAN`/`VIENEN` se comprueban como arrastre entre páginas. Admite fecha valor, fechas `dd/mm` con el año del periodo (también si cruza de año), saldos negativos con el signo detrás y descripciones de dos líneas.
- Decisión: la detección exige el nombre del banco además de la tabla; los rótulos y el formato de cuenta los comparten otros bancos. Sin la marca, el documento sigue al respaldo genérico. Se prueba después de BCP e Interbank.
- Decisión: `SUCCEEDED` solo si saldo inicial, continuidad fila a fila y saldo final cuadran al céntimo; los totales impresos son opcionales pero, si están, tienen que cuadrar (también como subtotales por página). Lo que no se entiende se señala (`BANCO_NACION_*`) y deja el resultado en revisión.
- Hecho: Excel `eecc.statement.banco_nacion` con fecha valor y un CSV por hoja, sin titular ni cuenta. La interfaz ya explica los códigos nuevos en el resumen del trabajo. La caracterización prueba cualquier PDF real del banco que aparezca en `referencias/`.
- Verificación: `pdf-worker scripts/check.ps1` en verde (273 pruebas, 93,75 % de cobertura, Ruff y mypy), con 35 nuevas sobre un PDF sintético de tres páginas y filas construidas a mano (columna única con signo, resumen encima de la tabla, subtotales, periodo que cruza de año, fechas sin año, filas no clasificables, y que ningún extractor reclame el banco de otro). Por HTTP contra la API interna, sin elegir extractor: detecta `banco-nacion-v1`, cinco comprobaciones en `PASSED` y publica XLSX y 4 CSV. `api-backend npm run check` (163) y frontend `typecheck`, `lint` y 157 pruebas.
- Pendiente: **validarlo con un estado de cuenta real** antes de darlo por soportado; los supuestos que puede desmentir están en `backend/pdf-worker/docs/architecture.md` y `docs/calidad/fallos-y-trampas.md`. En la interfaz, el selector de banco todavía no ofrece Banco de la Nación (hace falta su logo y tocar los datos simulados del Centro Financiero); como el worker detecta el banco solo, un PDF del banco ya se procesa aunque se elija otro.

## 2026-09-15 — Calendario con el diseño de referencia

- Hecho: rediseñado el *Calendario* (`features/financial-calendar`) siguiendo una captura de referencia. El mes va grande fuera de la tarjeta con sus flechas; dentro, el toggle Balance/Flujo y un botón de embudo que abre los bancos en un popover (en móvil, los cinco pills ocupaban tres filas). La cuadrícula siempre tiene seis semanas, con los días del mes vecino atenuados y no pulsables, cabecera de una letra y el día de hoy en un círculo.
- Hecho: un día con movimientos es una «pestaña»: número sobre fondo tintado e importe debajo. En móvil el importe va compacto (`−66.4K`) porque `−66,387` se desbordaba de la celda; desde `sm` se ve entero. El flujo negativo pasa a tono neutro, el verde marca las entradas y el rojo queda para el saldo en contra.
- Hecho: el resumen del mes pasa a una franja «Balance al · Saldo · Entradas · Salidas»; en móvil entradas y salidas se despliegan con un chevron. El `aria-label` de cada día lleva el importe exacto.
- Verificación: frontend `typecheck`, `lint` y 157 pruebas; capturas con Playwright a 375 px y 1440 px (sesión simulada) en Flujo, Balance, día seleccionado y filtro abierto.
- Pendiente: los datos siguen siendo los simulados de `mock-transactions.ts`, que arrancan en saldo 0 y dejan el saldo del mes muy negativo. `format:check` sigue fallando en archivos ajenos por finales de línea CRLF en disco (`core.autocrlf=true` frente a `endOfLine: lf`), no por su contenido.

## 2026-09-14 — Producción con Interbank e historial por persona

- Hecho: `eecc-worker` y `eecc-api` redesplegados con `railway up` desde `c9d0ae5`; los dos en `SUCCESS`. La API arrancó sin migraciones pendientes y el worker sin errores.
- Verificación: `/health` responde `ok`; la página publicada ya incluye Interbank habilitado, los textos `INTERBANK_*` y el historial «Solo los que has subido tú»; `/v1/jobs` sin sesión responde `401`. `EECC_WORKER_DEFAULT_EXTRACTOR_ID` no está definida en el worker, así que la detección automática elige Interbank sin configuración adicional.
- Pendiente: no se subió un documento en producción (no hay cuenta de prueba ahí). Queda confirmar en el navegador con una cuenta real: subir el PDF de Interbank y comprobar que otra cuenta no lo ve en *Historial*.
- Pendiente: el frontend de Vercel despliega desde GitHub y no se pudo comprobar desde aquí (sin CLI de Vercel ni de GitHub).

## 2026-09-14 — Estados de cuenta de Interbank

- Hecho: nuevo extractor `interbank-savings-v1` en `pdf-worker` para la plantilla de ahorro de Interbank (`Fecha | Concepto | Ingresos | Gastos | Saldo Contable`). Lee el saldo inicial (`EMPEZASTE <MES> CON`), cada movimiento con su importe con signo y su saldo, y la fila de cierre con totales. La selección automática lo prueba después de BCP y antes del respaldo genérico.
- Hecho: la reconciliación es completa y sin tolerancia: saldo fila a fila desde el inicial, totales de ingresos y gastos contra la suma de movimientos, y saldo final. Sin cierre, `NEEDS_REVIEW`.
- Defecto evitado: tras el cierre, el PDF trae una guía con un **ejemplo inventado** de la misma plantilla (su propia cabecera, saldo inicial y movimientos de otro año). La lectura termina en el cierre y la guía se descarta además por su título. Anotado en `fallos-y-trampas.md`.
- Hecho: Excel con esquema `eecc.statement.interbank` (Resumen con moneda, saldo inicial, totales y saldo final; Movimientos; Control_Paginas; Validaciones), y un CSV por hoja. No exporta titular, DNI ni número de cuenta.
- Hecho: en la interfaz, Interbank deja de estar «Próximamente» en el selector de banco, y los códigos `INTERBANK_*` tienen su explicación en el resumen del trabajo.
- Hecho: `tests/characterization/test_real_statements.py` reparte los PDF de `referencias/` por detector: los de Interbank ya no se caracterizan con el extractor de BCP.
- Verificación: `pdf-worker scripts/check.ps1` en verde (238 pruebas, 94,5 % de cobertura, Ruff y mypy), con 27 pruebas nuevas sobre un PDF sintético que reproduce la plantilla (varias páginas, publicidad, guía con ejemplo, saldo roto, documento truncado, importes sin signo). Contra el estado de cuenta real de 8 páginas: detectado con confianza 0,90, 127 movimientos, las cinco comprobaciones en `PASSED` y `SUCCEEDED`, con la guía descartada; solo se imprimieron códigos y conteos. Frontend: `typecheck`, `lint` y 96 pruebas.
- Pendiente: solo se ha visto la cuenta simple en soles. Otras cuentas de Interbank (dólares, empresas) o tarjetas pueden cambiar la plantilla; hay que confirmarlas con una muestra antes de darlas por soportadas.

## 2026-09-14 — Cada persona ve solo sus documentos

- Defecto corregido: *Historial* mostraba los documentos de toda la organización. Una cuenta de usuario recién creada, con un solo PDF, veía también los de otras personas y podía abrirlos y descargarlos. El detalle y la descarga solo comprobaban la organización, así que bastaba el identificador.
- Hecho: `GET /v1/jobs`, `GET /v1/jobs/{jobId}` y la descarga de artefactos filtran por `statement.uploadedById` igual a quien consulta. Un trabajo ajeno responde `404`. Una credencial de servicio ve lo subido por credenciales de servicio, el mismo grupo del cupo.
- Decisión: la regla vale también para el administrador. Gestiona cuentas, no lee documentos ajenos; en *Usuarios* sigue viendo cuántos conserva cada cuenta. Motivos y alternativas en [`ADR-0009`](../decisiones/ADR-0009-cada-persona-ve-solo-sus-documentos.md).
- Defecto corregido: la reutilización por idempotencia tenía alcance de organización, y subir un PDF que otra persona ya había procesado devolvía **su** trabajo. La clave guardada pasa a ser `sha256(dueño + clave)`. Consecuencia: la primera vez que alguien repita un PDF subido antes de este cambio, se procesa de nuevo.
- Hecho: la interfaz deja de decir «de tu organización» en el historial, en su estado vacío y en `JOB_NOT_FOUND`.
- Verificación: `api-backend npm run check` (163 pruebas) por código de salida. La suite contra PostgreSQL real (`RUN_DB_TESTS=1`) suma un caso con un administrador y un usuario de la misma organización: mismo PDF, historial de cada uno, detalle y descarga ajenos en `404`, y la credencial de servicio sin ver ninguno. **Contra el código anterior ese caso falla**. Frontend: `typecheck`, `lint` y `test:cov` (95 pruebas) en verde.
- Pendiente: `frontend npm run check` no pasa `format:check` por 14 archivos del rediseño llegado en paralelo (`3d16b00` y anteriores: `app.tsx`, `artifact-list.tsx`, `bank-selector.tsx`, `index.css`…). Se dejaron sin tocar para no pisar trabajo en curso; se arreglan con `npx prettier --write src`.

## 2026-09-12 — Producción al día y cuentas depuradas

- Hecho: `eecc-api` redesplegada en Railway con `railway up`. Seguía con el código del 9 de septiembre mientras el frontend de Vercel ya era el nuevo, y la gestión de usuarios fallaba entre ambos. La migración `20260912120000_administrador_y_usuario` se aplicó sola al arrancar.
- Hecho: en producción se crea `admin@eecc.local` como administrador y se eliminan desde la aplicación las cuentas de prueba (`prueba1..3@hotmail.com`), con sus documentos.
- Hecho: el repositorio pasa a público. Vercel bloqueaba los despliegues de ambos autores desde el 12 de septiembre (el plan Hobby no admite colaboración en repositorios privados); antes de publicarlo se revisó el historial completo: nunca contuvo PDF, Excel, CSV, `.env`, claves ni números de cuenta.
- Decisión: los despliegues bloqueados de Vercel no se reintentan solos; hace falta un commit nuevo o un *Redeploy*.
- Pendiente: `diego@avax.pe` sigue como administrador en producción. La aplicación no elimina administradores; hay que quitarle el rol en la base y después eliminarlo desde *Usuarios*. Y retirar `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` de `eecc-api`, que ya no hacen nada.

## 2026-09-12 — Solo correos de dominios admitidos, y un login que se entiende

- Hecho: `ALLOWED_EMAIL_DOMAINS` (por defecto `hotmail.com,empresa.pe,eecc.local`) limita los correos al crear una cuenta o al cambiarle el correo; responde `EMAIL_DOMAIN_NOT_ALLOWED`. Coincidencia exacta del dominio: `empresa.pe` no admite `otra.empresa.pe` ni `empresa.pe.falso.com`. Vacía, admite cualquiera.
- Decisión: no se aplica al inicio de sesión ni a la edición de otros datos. Ajustar la lista no debe dejar fuera de golpe a cuentas que ya existen, ni obligar a cambiarles el correo para corregir su nombre.
- Hecho: la sesión expone `allowedEmailDomains`, y los formularios de alta y edición los muestran bajo el correo y validan antes de enviar.
- Hecho: eliminada la cuenta local `diego@avax.pe` con la rutina de la aplicación: sus 3 documentos y sus archivos (3 PDF y 3 trabajos del worker) fuera. El descarte en el worker falló la primera vez porque el `.env` local lo espera en el puerto 8010 y se había levantado en el 8000; se completó después contra el propio worker, conservando el único trabajo que otro documento aún referencia.
- Hecho: revisado el rediseño del login llegado en paralelo. Se conservó su diseño y se corrigió: el botón «Acceder» no llegaba al contraste mínimo (blanco sobre `#88a0b9`, ≈2,6:1) y parecía deshabilitado; «¿Olvidaste tu contraseña?» parecía un enlace sin destino y ahora dice a quién acudir; la pantalla no nombraba la aplicación en móvil; y sobraba un bloque comentado que apuntaba a un logo inexistente. Las imágenes pasan de 1,2 MB a 100 KB: el panel a JPEG (mismas dimensiones) y el isotipo de 3600×5000 px, que se muestra a 28 px, a 81×112.
- Verificación: `api-backend npm run check` (161 pruebas) y frontend `npm run check` (95) y `npm run build`, por código de salida; login capturado en tres tamaños sin recursos rotos.

## 2026-09-12 — Administrador y usuario: gestión completa de cuentas

- Hecho: los roles pasan de cuatro a dos, `ADMIN` y `MEMBER`. `VIEWER` no se aplicaba en ninguna ruta y `OWNER` solo se distinguía en la protección del último propietario. La migración `20260912120000_administrador_y_usuario` deja en cada organización **una sola** cuenta administradora —la de rol más alto y, a igualdad, la activa más antigua, que es la del arranque o la semilla— y el resto como usuario; luego recrea el enum. Motivos y alternativas en [`ADR-0008`](../decisiones/ADR-0008-administrador-y-usuario.md).
- Hecho: el administrador crea usuarios y administradores (contraseña generada o escrita), cambia nombre, correo y contraseña, desactiva, reactiva, asciende y elimina; y ve cuántos documentos conserva cada cuenta. Nace `DELETE /v1/users/{userId}`, que borra también los documentos con la misma rutina del cupo (`removeAllForUploader`).
- Decisión: un administrador no se elimina **ni se degrada**; lo segundo porque, si no, eliminarlo quedaba a dos pasos. Sí se puede desactivar, que es reversible. Nadie se desactiva, se cambia el rol ni se fija la contraseña a sí mismo desde la gestión.
- Decisión: nombre, correo y contraseña no se cambian si la cuenta pertenece también a otra organización. Cerraba un agujero que ya existía en el restablecimiento de contraseña: el administrador de una organización podía tomar la cuenta que alguien usa en otra.
- Decisión: eliminar primero desactiva y cierra sesiones, después borra documentos y al final la cuenta. Si el borrado de archivos falla, la cuenta queda desactivada, no a medio borrar.
- Hecho: la interfaz pasa a *Usuarios* (`/usuarios`, con `/personas` redirigiendo) con indicadores, búsqueda, filtros, insignias de rol y estado, barra de documentos frente al cupo y diálogos para cada acción. La barra lateral agrupa la sección bajo *Administración*, y hay navegación para móvil, que antes no existía: por debajo de `md` la barra lateral desaparecía sin alternativa.
- Hecho: el menú de cuenta permite **cambiar la propia contraseña**. La pantalla de entrada pedía hacerlo desde el primer día sin ofrecer dónde. Como el servidor cierra todas las sesiones al cambiarla, la interfaz sale y explica el motivo en la pantalla de entrada.
- Hecho: la semilla fija la contraseña de una cuenta existente cuando `SEED_ADMIN_PASSWORD` está puesta a propósito. Es la vía de recuperación si se pierde la del único administrador.
- Hecho: corregida una prueba intermitente anterior a este cambio (`upload-page.test.tsx`, 3 de 8 corridas en `main`). No era de tiempo: el texto buscado aparecía un instante en la página de subida antes de navegar y la aserción veía el nodo ya desmontado. Ahora se ancla en el detalle; 0 fallos en 12 corridas. Anotado en `fallos-y-trampas.md`.
- Verificación: las tres capas en verde por código de salida (`api-backend npm run check` con 152 pruebas, frontend `npm run check` con 93 y `npm run build`; el worker no se tocó). Las suites contra base real (`RUN_DB_TESTS=1`, 17 pruebas) sobre una copia de la base local ya migrada. La migración se probó primero en esa copia y `prisma migrate diff` confirmó que no hay deriva con el esquema. Después, recorrido HTTP real con worker y PostgreSQL —alta generada y elegida, bloqueo del usuario en `/v1/users`, subida de dos PDF sintéticos, edición, `EMAIL_ALREADY_IN_USE`, sesión invalidada al fijar contraseña, desactivar y reactivar, los tres rechazos de protección, y eliminación con PDF y artefactos del worker borrados del disco (salvo uno que compartían otros documentos, conservado a propósito)— y capturas con Playwright en escritorio y móvil.
- Hecho: al integrar el rediseño del login que llegó en paralelo (`74eed17`), el aviso de sesión cerrada se colocó dentro de su tarjeta con estilo propio (`.asm-login-notice`). Ese commit cambió el botón de «Entrar» a «Acceder» y dejaba en rojo `upload-page.test.tsx`, y su CSS no pasaba `format:check`; ambas cosas quedan corregidas.
- Pendiente: al desplegar en Railway la migración deja como usuario a toda cuenta que no sea la administradora original; si alguien más debe administrar, hay que ascenderlo desde *Usuarios*.
- Pendiente: `frontend/e2e/statement-flow.spec.ts` (Playwright, fuera de `npm run check`) sigue usando el formulario de credencial retirado en ADR-0005; hay que reescribirlo para entrar con usuario y contraseña.

## 2026-09-09 — Interfaz unificada: se incorpora el diseño pendiente

- Hecho: el frontend adopta el diseño que estaba a medias fuera del repositorio —armazón con cabecera oscura, barra lateral, tarjetas y paleta propia— sin ceder nada del backend: rutas, roles y sesión siguen siendo los de este proyecto. Lo que traía el diseño y contradecía esas decisiones se descartó.
- Hecho: el menú de cuenta se apoya en la sesión real (`useSession`) en lugar de en una credencial escrita a mano. Con ello desaparece el último resto del modelo de clave de API en la interfaz: ya no hay campo donde escribirla ni formulario que se deshabilite por no tenerla, porque la identidad la da la cookie.
- Hecho: el aviso del cupo pasa a ser un componente compartido y aparece **también junto al formulario de subida**. Es antes de subir cuando avisar sirve de algo: después, el documento más antiguo ya se ha borrado. Con eso queda cerrado lo que [`ADR-0007`](../decisiones/ADR-0007-cupo-de-documentos-por-persona.md) dejaba pendiente.
- Hecho: el historial se separa en su propia ruta (`/historial`) y deja de repetir el encabezado que ya pone la página.
- Hecho: cubierta la gestión de personas, que estaba al 13% y es la superficie con la que se crean y revocan cuentas. Las pruebas fijan las salvaguardas que importan: nadie puede cambiarse el rol ni quitarse el acceso a sí mismo, un rechazo por último propietario se explica en vez de fallar en silencio, y la contraseña temporal se muestra una vez y se puede descartar.
- Decisión: una prueba anclaba en un estado intermedio de la navegación —encontraba el distintivo de estado mientras la página de detalle aún cargaba— y pasaba por casualidad. Se ancló en el texto que solo existe con la consulta ya resuelta.
- Verificación: las tres capas en verde **por código de salida**, no por leer su salida: frontend `npm run check` y `npm run build`, `api-backend npm run check` y `pdf-worker scripts/check.ps1`. 76 pruebas de frontend (14 nuevas) con la cobertura de sentencias subiendo del 79% al 93%.
- Pendiente: desplegar el frontend en Vercel (exige iniciar sesión desde un navegador) y volver a desplegar `eecc-api` en Railway, cuya imagen es la que lleva la página dentro.

## 2026-09-09 — La interfaz avisa antes de que se pierda un documento

- Hecho: el historial dice cuántos documentos propios quedan dentro del cupo y, al llegar al tope, advierte que **el siguiente borrará el más antiguo**. Era lo que quedaba pendiente de [`ADR-0007`](../decisiones/ADR-0007-cupo-de-documentos-por-persona.md): la regla estaba implementada pero nadie la veía venir.
- Hecho: la sesión (`/v1/auth/login` y `/v1/auth/me`) devuelve `retainedStatementsPerUser`. Va ahí y no en una ruta aparte para que la interfaz pueda advertirlo sin una petición más; codificarlo en el frontend habría dejado que se separara del valor real de la instalación.
- Hecho: el listado de trabajos marca `uploadedByMe`. Hacía falta porque el cupo es por persona mientras el historial muestra los de toda la organización: sin ese dato, el aviso contaría documentos ajenos y sería falso.
- Hecho: retirados `railway.json` y `railway.worker.json`. No solo están obsoletos —Railway los retira el 2026-12-01— sino que **no eran lo que usaba el despliegue real**: los dos servicios comparten repositorio, así que un archivo en la raíz no puede decir cosas distintas a cada uno. El Dockerfile se elige con `RAILWAY_DOCKERFILE_PATH` por servicio, y la guía ya lo explica.
- Verificación: las tres capas en verde por código de salida, 3 pruebas nuevas del aviso —incluida una que comprueba que no cuenta documentos de otras personas— y comprobación contra el despliegue real: la sesión trae el cupo, el historial marca los propios y el ciclo de subida y descarga sigue funcionando.
- Pendiente: el frontend en Vercel. La configuración está lista en `frontend/vercel.json`, pero desplegarlo exige iniciar sesión en Vercel desde un navegador.

## 2026-09-09 — Desplegado en Railway: base de datos, worker y API

- Hecho: proyecto `eecc` en Railway con PostgreSQL, `eecc-worker` (privado) y `eecc-api` (público, con dominio). Los tres con volumen. Verificado en producción de punta a punta: entrar, subir un documento, descargar el XLSX y comprobar el cupo de tres.
- Hecho: `BootstrapService` crea la organización y su primera persona al arrancar, **solo si la base no tiene ningún usuario**. Nace de un problema real: en Railway la base solo es accesible desde la red privada, y `railway ssh` exige registrar una clave SSH; sembrar desde fuera obligaría a exponer la base.
- Hecho: `frontend/vercel.json` reenvía `/v1` y `/health` a la API de Railway. Sin ese reenvío, la página en Vercel y la API en Railway son sitios distintos y la cookie `SameSite=Lax` no viaja: el login respondería 200 y la sesión no persistiría. Guía en [`docs/despliegue/vercel.md`](../despliegue/vercel.md).
- Hecho: cuatro trampas que solo aparecieron desplegando de verdad.
  - Railway inyecta `PORT=8080` también en un servicio sin dominio, así que el worker escuchaba ahí mientras `WORKER_BASE_URL` apuntaba al 8000. Se fija `PORT=8000` en el worker.
  - Los volúmenes se montan como root y los contenedores corren sin privilegios: el worker respondía 500 con `Permission denied` al primer documento. Ambas imágenes arrancan ahora con un script que ajusta el dueño y baja privilegios.
  - Ese script usa `setpriv` en Debian pero **`su-exec` en Alpine**, donde `setpriv` lo aporta BusyBox y solo maneja capacidades: no sabe cambiar de usuario.
  - Una edición del script en Windows lo dejó con CRLF y el contenedor falló con «no such file or directory», que se refiere al intérprete del shebang y no al archivo. Se añade `.gitattributes` para que la regla lo impida en vez de la disciplina.
- Decisión: `serve.py` registra en qué familia de red quedó escuchando. Fue lo que permitió ver el desajuste de puerto en un vistazo; antes el arranque no decía nada y el diagnóstico era a ciegas.
- Hecho: `railway config pull` volcó la configuración de `comfortable-truth` —otro proyecto en producción del mismo dueño— dentro de este repositorio. Se retiró; conviene saber que ese comando escribe en el árbol de trabajo.
- Verificación: `npm run check`, `scripts/check.ps1` y `vitest` en verde por código de salida, ambas imágenes construidas y probadas en local con un volumen propiedad de root, y el sistema completo ejercitado contra el despliegue real.
- Pendiente: la interfaz sigue sin avisar de que subir un cuarto documento hará perder el primero. Y `BOOTSTRAP_ADMIN_PASSWORD` debe retirarse del entorno una vez cambiada la contraseña.

## 2026-09-08 — Cada persona conserva solo tres documentos

- Hecho: `StatementRetentionService` deja como mucho `RETAINED_STATEMENTS_PER_USER` documentos por persona —3 por defecto— y borra los anteriores enteros: PDF de origen, artefactos del worker y fila. Se aplica tras registrar cada documento nuevo, sin planificador. Motivos y alternativas en [`ADR-0007`](../decisiones/ADR-0007-cupo-de-documentos-por-persona.md).
- Decisión: cupo por persona y no por organización, para que la actividad de alguien no borre el trabajo reciente de un compañero. Una credencial de servicio (`uploadedById` nulo) forma su propio grupo.
- Decisión: se borra el documento completo y no solo sus archivos. Un historial que enumera trabajos cuyos resultados ya no se pueden descargar confunde más de lo que informa.
- Decisión: antes de pedir al worker que descarte un trabajo se comprueba que ningún otro documento lo referencie. Su identificador se deriva del contenido, así que dos organizaciones que subieron el mismo archivo comparten artefactos; borrarlos dejaría a la otra sin poder descargar lo suyo.
- Hecho: los artefactos se borran explícitamente antes que el documento. Su relación con el intento es `NoAction`, y dejar que cayeran por cascada dependía del orden en que la base resolviera las claves.
- Hecho: vuelven `ObjectStorageService.remove` y `WorkerClientService.discardJob`. El `DELETE` del worker, añadido para el modo sin persistencia y luego sin llamador, recupera su uso.
- Verificación: además de 6 pruebas del servicio, medición real contra PostgreSQL subiendo cinco documentos distintos con la misma persona. Los PDF en disco crecen 1 → 2 → 3 y se quedan en 3; el documento de otra persona queda intacto; y los trabajos del worker en disco coinciden exactamente con los referenciados en la base. Cobertura de la API en 94/82/91.
- Pendiente: la interfaz **no avisa** de que subir un cuarto documento hará perder el primero. Y sigue sin haber caducidad por tiempo: un documento dentro del cupo se conserva indefinidamente.

## 2026-09-08 — Listo para desplegar en Railway

- Hecho: la API sirve también el frontend compilado (`STATIC_ROOT`). No es comodidad: la cookie de sesión es `SameSite=Lax` y el navegador solo la envía si la página y la API comparten origen. En Railway cada servicio recibe su propio dominio, así que separarlos dejaría a todo el mundo fuera con un síntoma engañoso —el login responde 200 y la sesión no persiste—.
- Hecho: `Dockerfile.api` (multietapa: compila frontend y API en una imagen), `Dockerfile.worker`, `railway.json`, `railway.worker.json`, `.dockerignore` y la guía [`docs/despliegue/railway.md`](../despliegue/railway.md).
- Decisión: el respaldo que entrega la página se registra **antes** del enrutador de Nest. Se intentó después y nunca se ejecutaba: Nest atiende él mismo las rutas que no reconoce. El respaldo descarta `/v1`, `/health`, `/docs` y cualquier ruta con extensión, así que no le quita nada a la API; devolver HTML donde se espera JavaScript produce el críptico «Unexpected token '<'».
- Hecho: al construir las imágenes aparecieron tres fallos que solo se ven ejecutando.
  - `npm ci --omit=dev` dejaba fuera el CLI de Prisma, que el arranque necesita para `migrate deploy`; `npx` habría intentado descargarlo en cada arranque. Pasa a dependencia de producción.
  - El paso documentado para crear la primera cuenta no funcionaba: `npm run prisma:seed` usa `ts-node`, ausente en la imagen. La semilla se movió a `src/cli/seed.ts` para que se compile, y se ejecuta con `node dist/cli/seed.js`.
  - `uvicorn --host ::` crea un socket **solo IPv6**: comprobado que en la red IPv4 de Docker responde «conexión rechazada». Y `0.0.0.0` dejaría el worker inalcanzable en la red privada IPv6 de Railway. Nace `statement_worker/api/serve.py`, que abre un socket de doble pila con `create_server(dualstack_ipv6=True)` y sirve en ambos entornos sin configuración.
- Hecho: **el `check` de la API llevaba fallando desde el commit `0876c89`** por el umbral de cobertura, y no se detectó porque el filtro que se aplicaba a la salida ocultaba la línea del umbral. Al retirar el módulo efímero —que estaba bien cubierto— la media global cayó por debajo del mínimo. Se comprueba ahora por código de salida y no por inspección de texto.
- Hecho: la causa de fondo era `users.service.ts` al 27 %. Se escribió su especificación: 13 pruebas sobre las reglas que importan —protección del último propietario, revocación inmediata de sesiones al retirar el acceso, alta de alguien que ya existe en otra organización sin tocar su contraseña, y que el hash entregado corresponda de verdad a la clave temporal—. Con el guard unificado y el respaldo del frontend, la cobertura pasa de 89/73/84 a 95/82/92.
- Verificación: las tres capas en verde **por código de salida**. Y las dos imágenes construidas y ejecutadas de verdad: PostgreSQL, worker y API en una red de Docker, migraciones aplicadas solas al arrancar, primera cuenta creada dentro del contenedor, y el ciclo completo de entrar, subir un documento, descargar el XLSX y dar de alta a otra persona.
- Pendiente: falta montar volúmenes en Railway. El sistema de archivos de un contenedor es efímero y sin ellos los PDF y los resultados desaparecen en cada despliegue, aunque sus filas sigan en la base.

## 2026-09-08 — PostgreSQL como única persistencia

- Hecho: retirado el modo `memory`. Se van `PERSISTENCE_MODE` y las variables `EPHEMERAL_*`, el módulo `modules/ephemeral`, el helper `common/persistence`, los puertos de `statements.port.ts` —los controladores vuelven a los servicios concretos— y `discardJob` del cliente del worker. Motivos en [`ADR-0006`](../decisiones/ADR-0006-postgresql-como-unica-persistencia.md); [`ADR-0004`](../decisiones/ADR-0004-modo-sin-persistencia.md) queda marcado como reemplazado, no reescrito.
- Decisión: el modo se retira porque al añadir identidad de usuarios quedó incoherente. Sin base de datos no hay dónde guardar personas, así que se quedó sin inicio de sesión: ya no ofrecía el mismo producto, solo el mismo contrato HTTP. Mantenerlo obligaba a implementar cada cosa dos veces.
- Hecho: `instalar.ps1` y `ejecutar.ps1` pierden `-Modo`. El instalador levanta PostgreSQL, migra y siembra la primera cuenta; el lanzador se niega a arrancar si la base no responde, en vez de dejar que la API muera en la primera consulta.
- Hecho: al verificar apareció un 500 al subir un documento ya procesado. `Artifact.objectKey` es único y la clave de los resultados era `worker/<org>/<jobDelWorker>/<nombre>`; como el `job_id` del worker se deriva del contenido, reprocesar el mismo documento con otra clave de idempotencia chocaba contra la fila anterior. No lo causó este cambio: lo dispara cualquier rotación de `FINGERPRINT_SECRET` o subida de `PROFILE_VERSION`, que es justo para lo que existe esa variable.
- Decisión: la clave incluye ahora el intento. La descarga acepta las dos formas —el segmento del intento es opcional en el patrón— para no dejar inservibles las filas ya guardadas.
- Verificación: `npm run check` (86 pruebas), `scripts/check.ps1` del worker (206) y `vitest` (58). Además, instalación limpia con `instalar.ps1` y recorrido real contra PostgreSQL: entrar, subir el documento que antes daba 500, repetirlo para comprobar la idempotencia, y descargar el XLSX y validarlo con openpyxl.
- Pendiente: sin el modo efímero, la retención vuelve a ser urgente. `Organization.retentionDays`, `Statement.retainUntil` y `Artifact.retainUntil` existen en el esquema y ningún código los aplica todavía.

## 2026-09-08 — Cada persona entra con su cuenta

- Hecho: identidad de usuarios completa. `User` gana contraseña derivada con `scrypt`, último acceso y bloqueo por intentos; nace `Session`, y la sesión viaja en una cookie `httpOnly` con token opaco. Migración `20260908201707_usuarios_y_sesiones`. Decisión y alternativas en [`ADR-0005`](../decisiones/ADR-0005-identidad-de-usuarios-y-sesiones.md).
- Decisión: token opaco en tabla y no JWT. Con un token firmado, revocar el acceso a alguien exigiría una lista de revocación —la misma consulta que se quería evitar— o dejarle trabajar hasta que caducase. Comprobado en vivo: al revocar la membresía, su petición siguiente ya recibe 401.
- Decisión: `scrypt` de la biblioteca estándar en vez de argon2 o bcrypt, que exigen compilación nativa y por tanto toolchain instalada en Windows. Los parámetros de coste van dentro del hash para poder endurecerlos sin invalidar lo guardado.
- Decisión: proxy de Vite para `/v1`. Entre `localhost:5173` y `127.0.0.1:3000` el navegador ve dos sitios distintos y no enviaría una cookie `SameSite=Lax`; sirviendo bajo el mismo origen la cookie funciona y además desaparece CORS del desarrollo.
- Hecho: `Statement.uploadedBy` y `AuditEvent.actorUserId` por fin se rellenan. Existían en el esquema desde ADR-0002 sin que ningún código los escribiera; ahora quedan atribuidos el inicio de sesión, el alta y cambio de personas, y el procesamiento de cada documento.
- Hecho: guards separados por intención. `AuthGuard` acepta sesión o credencial de servicio; `SessionGuard` exige persona y protege la gestión de usuarios; `RolesGuard` filtra por rol. Una credencial de servicio no tiene rol, así que no puede crear ni desactivar cuentas.
- Hecho: el login responde igual ante correo inexistente que ante contraseña errónea, y verifica contra un hash de descarte cuando el correo no existe para que el tiempo de respuesta tampoco lo delate.
- Hecho: en el frontend, página de inicio de sesión, rutas protegidas, sección *Personas* para administradores y cabecera con la sesión. Se retiró el formulario de credencial, que era el sustituto provisional.
- Hecho: `instalar.ps1 -Modo base-de-datos` levanta PostgreSQL, migra, siembra la primera cuenta e imprime sus datos. Y ahora se niega a instalar con los servicios en marcha: con la API viva, Windows bloquea el motor de Prisma y `prisma generate` fallaba con un `EPERM` que no explicaba nada.
- Verificación: `npm run check` (104 pruebas), `scripts/check.ps1` del worker (206) y `vitest` (58). Además, prueba manual completa contra PostgreSQL real: entrar, crear una persona, entrar con ella, subir un documento, comprobar en la base que quedó atribuido, ver la auditoría, revocarle el acceso y confirmar que su sesión abierta deja de valer al instante.
- Pendiente: una persona con varias organizaciones entra siempre a la primera membresía activa; falta poder cambiar entre ellas. Tampoco existe aún el flujo de invitación por enlace: el alta entrega una contraseña temporal.

## 2026-09-04 — Puesta en marcha en dos comandos y una raíz que se explica sola

- Hecho: `instalar.ps1` deja el proyecto listo (entorno de Python, dependencias de API y frontend, cliente Prisma y archivos `.env`). Es idempotente y no pisa valores ya escritos: completa las claves que faltan y genera la credencial una sola vez.
- Hecho: `ejecutar.ps1` levanta los tres servicios, espera a que respondan y muestra URL, credencial y modo. Admite `-Detener`, `-Estado`, `-SinFrontend` y `-Modo`.
- Decisión: `ejecutar.ps1` deriva el puerto del worker de `WORKER_BASE_URL` en vez de fijarlo. Ese desajuste ya costó un rato de diagnóstico: la API respondía `WORKER_UNAVAILABLE` sin decir por qué. Con una sola fuente de verdad no puede repetirse.
- Decisión: detener por puerto y no por identificador guardado. `npm` y `cmd` lanzan procesos hijo y matar al padre deja al hijo escuchando; ya pasó durante las pruebas.
- Hecho: `README.md` reescrito para situarse rápido, `EJECUTAR.md` nuevo con la guía de ejecución y los fallos comunes, y `CLAUDE.md` como puerta de entrada para agentes. Se eliminó `agent.md`, que solo apuntaba a `AGENTS.md` sin que ninguna herramienta lo detectara; `AGENTS.md` sigue siendo la fuente normativa.
- Hecho: `.gitignore` cubre ahora `RESULTADOS/`, `PDF_MOVIMIENTOS/` y `output/` enteras, y el contenido de `referencias/` salvo los `.py`. Ignorar la carpeta completa y no solo por extensión evita que se cuele un `.txt` o un `.json` con datos. Los scripts legacy siguen versionados porque la prueba de paridad los carga.
- Hecho: al escribir los scripts aparecieron dos trampas de Windows PowerShell 5.1 que quedan documentadas en el código: `2>&1` sobre un ejecutable nativo convierte un simple `npm warn` en error terminante, y un `.ps1` sin BOM se lee como ANSI y rompe los acentos.
- Decisión: `test/jest.setup.ts` fija `PERSISTENCE_MODE ??= 'database'`. Sin eso el `.env` de cada máquina decidía en qué modo corrían las pruebas, y la suite del modo con base de datos fallaba en un equipo configurado sin persistencia. Se detectó justo así, al dejar el `.env` local en `memory`.
- Verificación: ciclo completo real —`ejecutar.ps1 -Detener`, `instalar.ps1`, `ejecutar.ps1`— y subida de un PDF sintético por la API con la credencial recién generada: 201, cinco artefactos, y las carpetas `artifacts/` y `storage/` vacías después. `npm run check` y `scripts/check.ps1` en verde.
- Hecho: antes del primer `git push` apareció que el nombre del titular real y su número de cuenta completo estaban escritos en `docs/architecture.md`, dos pruebas y el script legacy, aunque los PDF sí estuvieran ignorados. Se anonimizaron los cuatro sitios: la medición y la forma del número se conservan, la identidad no.
- Decisión: `test_real_statements.py` descubre los PDF con `ROOT.glob("*.pdf")` en vez de listar sus nombres. Los nombres de archivo llevaban titular y cuenta, y de paso la suite ahora corre con los documentos que tenga cada quien. Verificado con `RUN_REAL_STATEMENTS=1`: 9 pruebas pasan, incluidas las 3 que antes se saltaban.
- Pendiente: el proyecto ya tiene `git init` y primer commit publicado.

## 2026-09-03 — Un modo que no guarda nada y una raíz sin archivos sueltos

- Hecho: `PERSISTENCE_MODE=memory` sirve el contrato público completo sin PostgreSQL y sin escribir en disco. El PDF de origen no se guarda, los XLSX/CSV se traen del worker a memoria y se le pide que borre su copia, y el historial vive en el proceso acotado por cupo y caducidad. Decisión y alternativas en [`ADR-0004`](../decisiones/ADR-0004-modo-sin-persistencia.md).
- Hecho: los controladores dependen de tres puertos (`StatementProcessor`, `JobReader`, `ArtifactDownloader`) y cada módulo resuelve el token según el modo. Las implementaciones con base de datos no se tocaron, así que sus pruebas siguen siendo las mismas.
- Hecho: el worker expone `DELETE /internal/statements/{job_id}`, que borra artefactos y manifiesto. Es idempotente y valida el identificador con el mismo patrón que la descarga.
- Decisión: en modo memoria `PrismaService` se construye pero no conecta, en vez de sustituirse por un doble vacío. Si algún camino intentara consultar la base, el fallo de conexión lo delata en lugar de fingir que la escritura ocurrió; la e2e se apoya justo en eso, porque arrancar sin servidor sería imposible si conectara.
- Hecho: al probar el orden del historial apareció que dos trabajos creados en el mismo milisegundo se desempatan por identificador. Es el mismo criterio que `ORDER BY created_at DESC, id DESC` en SQL, así que se conservó la paridad y se corrigió la prueba en vez de inventar un orden distinto para memoria.
- Hecho: los scripts legacy y los documentos de muestra se movieron de la raíz a `referencias/`. `legacy_harness.repository_root` pasó a ser `references_root` y apunta a esa carpeta; sin ese cambio la comparación con el legacy se habría saltado en silencio en vez de fallar.
- Verificación: `npm run check` en `api-backend` (tipos, ESLint, Prettier, esquema Prisma y 80 pruebas con cobertura) y `scripts/check.ps1` en `pdf-worker` (206 pruebas, 95,6 % de cobertura, ruff y mypy). La e2e nueva recorre carga, consulta, historial y descarga en modo memoria comprobando que el almacenamiento de objetos nunca se usa.
- Pendiente: el modo memoria admite una sola credencial y una sola organización. Y `retentionDays`/`retainUntil` siguen sin implementarse en el modo con base de datos: hoy nada caduca solo allí.

## 2026-08-26 — Lectura repartida entre procesos y un servicio que deja de quedarse sordo

- Hecho: el perfilado del estado de cuenta de 425 páginas atribuyó ~95 % del tiempo a `extract_words` convirtiendo 1,5 millones de objetos de carácter. No había nada que afinar dentro de esa conversión.
- Hecho: `read_bcp_pdf_with_pdfplumber` reparte las páginas en tramos, cada uno leído en su propio proceso, y reordena por número de página. Umbrales medidos: por debajo de 24 páginas no compensa (arrancar el pool cuesta 0,37 s) y nunca más de 8 procesos ni de `cpu_count() - 1`.
- Hecho: 425 páginas pasan de 35,1 s a 10,4 s (3,4×) y 447 páginas de 38,2 s a 11,8 s (3,2×), con filas, métricas y sonda **idénticas** en ambos casos. Extremo a extremo por HTTP, de 42,4 s a 15,4 s en el worker y 16,7 s por la pila completa con NestJS y PostgreSQL.
- Hecho: el respaldo genérico reparte igual, con la parte común extraída a `extractors/page_parallelism.py`. Sobre las mismas 425 páginas, 54,0 s pasan a 20,7 s (2,6×) con tablas, rejilla y sonda idénticas. Importa para lo que pediste —que funcione con cualquier banco—: sin esto, un banco sin extractor propio habría tardado más que el BCP antes de optimizarlo.
- Decisión: pool por documento, no compartido. Ahorraría un 3 % a cambio de estado global mutable y un modo de fallo nuevo cuando un hijo muere.
- Decisión: si la máquina no puede repartir, se lee en el propio proceso en vez de fallar. Un `BrokenProcessPool` habría salido como HTTP 500 con traza; ahora el documento se lee más despacio con el mismo resultado, y el camino secuencial es literalmente «un tramo que cubre todo», así que no puede divergir del repartido.
- Hecho: al medir apareció un fallo mayor. El manejador `async def` llamaba al trabajo bloqueante en directo: `/health` tardó **39 s** en contestar durante un documento, frente a 1,5 ms en reposo. Un balanceador habría dado el worker por caído mientras trabajaba bien.
- Decisión: todo el trabajo bloqueante vive en `_process_document` y se ejecuta con `run_in_threadpool`. Como eso habilita concurrencia real, un semáforo `max_concurrent_documents` (2 por defecto) evita pedir más procesos que núcleos.
- Hecho: se corrigió un fallo intermitente que aparecía ~1 de cada 4 corridas. `openpyxl` estampa `modified` con el instante de guardado, así que el mismo contenido escrito dos veces da bytes distintos si cruza el segundo; la prueba comparaba checksums entre dos escrituras independientes. Ahora compara qué artefactos se publican.
- Hecho: se corrigió también el frontend, cuya suite estaba en rojo por un motivo falso: Vitest recogía el spec de Playwright de `e2e/` y fallaba al cargarlo. Una suite en rojo por algo que no es un fallo enseña a ignorar el rojo.
- Hecho: retirado `baseUrl` del `tsconfig.json`, que TypeScript 7 dejará de admitir. `paths` funciona sin él desde la 4.1 resolviendo contra el propio archivo de configuración, así que basta con escribir `./src/*`. Se prefirió eso a silenciar el aviso con `ignoreDeprecations`, que solo aplaza el problema.
- Verificación: `scripts/check.ps1` en verde con 204 pruebas y 95,57 % de cobertura, y 207 con `RUN_REAL_STATEMENTS=1`; `npm run check` del frontend (61 pruebas) y 62 del api-backend; el flujo por navegador con Playwright contra la pila viva. Las dos guardas de disponibilidad se comprobaron **contra el código anterior** y fallan como deben (`el servicio solo contestó cuando el documento ya había terminado` y `4 != 1`). Contra el servicio en marcha: 14 853 movimientos en 425 páginas y 15 636 en 447, `SUCCEEDED`, cero avisos y las seis validaciones en `PASSED`, con `/health` en milisegundos durante todo el proceso.
- Observado sin corregir: `test_preserves_existing_target_unless_overwrite_is_explicit` falló una vez y no se reprodujo en diez corridas completas posteriores. Queda anotado en `fallos-y-trampas.md` en lugar de añadir reintentos al publicador atómico sin haber confirmado el mecanismo.
- Pendiente: procesamiento asíncrono con `202` y callback firmado, que necesita Redis; almacenamiento por objetos con URLs firmadas; autenticación de usuarios; que la caída al camino secuencial sea visible en operación, que hoy no lo es porque el worker no tiene logging.

## 2026-08-26 — Escalabilidad del extractor genérico

- Hecho: `word_grid.py` construye las columnas desde la posición de las palabras, con tolerancia de fila deducida del interlineado del documento y límites calculados solo con filas de movimiento. El índice de una columna ya significa lo mismo en todas las páginas.
- Hecho: `document.py` resuelve el mapa una vez por documento y lo aplica a cada página; el encabezado suele imprimirse solo en la primera.
- Hecho: las descripciones partidas en varias líneas se unen al movimiento anterior en vez de descartarse.
- Hecho: la detección del respaldo pesa la estructura (una tabla de al menos cinco filas fechadas con importes) por encima del vocabulario, y la selección delega la última palabra en la estrategia, que necesita ver el documento completo.
- Hecho: se ampliaron los formatos aceptados: fechas ISO, meses en inglés y nombres completos, signo al final del importe, espacio duro como separador y monedas de varios países.
- Defecto corregido: la clave de idempotencia no incluía la versión del extractor, así que tras corregir una regla el servicio seguía devolviendo la lectura anterior.
- Verificación: 188 pruebas con 95.41% de cobertura. En vivo, tres variantes de plantilla —multipágina con encabezado solo en la primera, sin encabezado y con rótulos en otro idioma— se procesan con saldo verificado; los dos estados de cuenta reales de BCP siguen en `SUCCEEDED` con 14 853 y 15 636 movimientos y cero advertencias.
- Pendiente: documentos escaneados sin capa de texto y estados de cuenta sin columna de saldo, donde no hay aritmética que demostrar.

## 2026-08-26 — Las columnas se deducen resolviendo la aritmética

- Hecho: `extractors/generic/inference.py` deduce fecha, descripción, cargo, abono y saldo probando todas las asignaciones posibles de las columnas numéricas y quedándose con la única que hace avanzar el saldo correctamente durante al menos cuatro transiciones.
- Decisión: si ninguna asignación cuadra, o si más de una lo hace, no se deduce nada. La lectura queda demostrada por el documento o no se produce.
- Hecho: el perfil de cada columna se calcula solo sobre las filas que parecen movimientos; los títulos y pies del documento distorsionaban la proporción de fechas e importes.
- Hecho: cubre estados de cuenta sin fila de encabezado, con rótulos en otro idioma y con importes firmados en una sola columna.
- Hecho: el resultado se marca con `GENERIC_COLUMNS_INFERRED` para distinguir lo leído de lo deducido.
- Verificación: en vivo, un estado de cuenta con encabezados `DT / NARRATIVE / WITHDRAWAL / LODGEMENT / BAL` se procesa con saldo verificado; el estado de cuenta real de BCP sigue usando su plantilla especializada con sus seis invariantes y 15 636 movimientos.
- Verificación: 178 pruebas del worker con 95.87% de cobertura.
- Defecto corregido: la API autorizaba `localhost` pero no `127.0.0.1`, y el navegador los trata como orígenes distintos; el historial fallaba con error de CORS.
- Pendiente: cuando el documento no traiga columna de saldo no hay nada que demostrar; ahí un extractor especializado por banco sigue siendo la única vía fiable.

## 2026-08-26 — Respaldo genérico: bancos sin extractor especializado

- Hecho: `extractors/generic/` lee estados de cuenta de cualquier banco identificando el encabezado de la tabla y traduciendo cada columna a un rol mediante sinónimos (`RETIROS`/`CARGOS`/`DEBE`, `DEPOSITOS`/`ABONOS`/`HABER`, `SALDO`).
- Decisión: no se hereda la heurística del legacy, que deducía cargo o abono a partir de palabras de la descripción. Si el encabezado no se reconoce, el resultado es `FAILED` con causa explícita y sin archivo publicado.
- Decisión: sin conocer la plantilla, la única verificación objetiva es la continuidad del saldo. Solo se declara reconciliado con al menos cinco transiciones verificadas; en otro caso queda en `NEEDS_REVIEW`.
- Hecho: `resolve_best_strategy` prueba primero las plantillas conocidas y solo después el respaldo; un documento que no parece estado de cuenta sigue devolviendo `UNSUPPORTED_DOCUMENT`.
- Hecho: contrato XLSX propio `eecc.statement.generic` v1, separado del especializado por banco.
- Hecho: fixture sintético de un banco ficticio con otros sinónimos de columna, más su caso negativo sin encabezados.
- Verificación: 168 pruebas del worker con 95.76% de cobertura; en vivo, el PDF de otro banco se procesa con `generic-table-v1` y saldo verificado, mientras el estado de cuenta real de BCP sigue usando su plantilla especializada con sus seis invariantes.
- Pendiente: extractores especializados por banco conforme lleguen muestras reales; el respaldo no puede reconciliar documentos sin columna de saldo.

## 2026-08-26 — Los estados de cuenta reales revelaron cuatro defectos

- Hecho: se procesaron los dos estados de cuenta reales del repositorio (425 y 447 páginas). Antes eran rechazados; ahora terminan en `SUCCEEDED` con las seis invariantes en verde y sin advertencias.
- Defecto corregido: el detector exigía la palabra del banco, que en el documento real vive en el logo y no deja texto. Se repesó hacia la firma estructural: cabeceras de columna 0.45, formato de cuenta 0.30, marca del banco 0.30, periodo 0.10.
- Defecto corregido: la tolerancia de agrupación heredada del legacy (2.8) separaba la etiqueta del pie de sus importes. Medido sobre el documento real, los movimientos distan 11.2-11.4 puntos y la etiqueta de sus cifras 5.2-6.7; con 8.0 se unen sin fusionar movimientos.
- Defecto corregido: `TOTAL MOVIMIENTO` se rotula en cada página pero solo trae cifras al final, y ese total es el del documento. La invariante se renombró a `BCP_DECLARED_TOTALS` y ahora contrasta el único total impreso contra todo el documento.
- Defecto corregido: un total ausente se comparaba como si fuera cero, inventando una discrepancia en las 425 páginas. Ahora no se evalúa.
- Hecho: la detección ocurre tras leer solo la primera página; antes se recorrían las 425 para luego rechazar el documento.
- Verificación: paridad exacta con el XLSX que produjo el script legacy del mismo PDF: 14 853 movimientos, mismas sumas de cargos y abonos, mismo saldo final. La versión nueva además reconcilia el balance, que el legacy nunca comprobaba.
- Hecho: `tests/characterization/test_real_statements.py` repite esa comprobación cuando los documentos están en la máquina y `RUN_REAL_STATEMENTS=1` está activo; no versiona ni imprime contenido.
- Verificación: 156 pruebas del worker más 9 de caracterización con documentos reales; 73 del api-backend; 59 del frontend. El circuito completo procesa el estado de cuenta real por HTTP en 38 segundos y publica Excel de 539 KB y cuatro CSV.
- Pendiente: la espera de 38 segundos es síncrona; el procesamiento asíncrono con `202` y callback firmado ya tiene justificación medida.

## 2026-08-26 — Historial de documentos procesados

- Hecho: `GET /v1/jobs` devuelve el historial de la organización con paginación por cursor opaco sobre (fecha, id); el desplazamiento por página se descartó porque repite o salta filas al llegar trabajos nuevos.
- Hecho: la interfaz lista los documentos procesados con estado, fecha y conteos, y enlaza a cada trabajo; el listado se invalida al publicar uno nuevo.
- Hecho: las pruebas contra base real comprueban que el historial de una organización no incluye trabajos de otra.
- Defecto corregido: `ARTIFACT_NOT_FOUND` no tenía mensaje en el cliente y aparecía como error inesperado.
- Hecho: la prueba de navegador puede reutilizar un servidor de desarrollo propio con `E2E_REUSE_SERVER=1`, sin adoptar uno ajeno por defecto.
- Observación operativa: los resultados viven en el disco del worker; cambiar su directorio de artefactos deja sin descarga los trabajos anteriores. Se resuelve al conectar S3.
- Verificación: 149 pruebas del worker; 73 del api-backend (97.27%), 69 de ellas contra PostgreSQL real; 59 del frontend más la de navegador con historial.
- Pendiente: S3-compatible con URLs firmadas, procesamiento asíncrono con callback firmado y autenticación de usuarios.

## 2026-08-26 — Pila completa verificada contra PostgreSQL real y navegador

- Hecho: primera migración Prisma aplicada, seed de organización y credencial, y `scripts/local-postgres.ps1` para levantar la base sin Docker.
- Decisión: Docker Desktop no puede arrancar en este equipo porque la virtualización está deshabilitada en la BIOS y falta WSL; la ruta oficial sigue siendo Docker Compose y el script es solo una alternativa de desarrollo.
- Hecho: `tests/tenant-isolation` verifica contra base real que un trabajo y sus artefactos no son visibles ni descargables desde otra organización, que la huella difiere entre tenants y que la idempotencia se respeta.
- Hecho: prueba de extremo a extremo con Playwright sobre navegador real: credencial, carga, revisión de invariantes y descarga del Excel.
- Defecto corregido: la clave de objeto de los resultados se derivaba solo del contenido, así que dos organizaciones con el mismo documento chocaban contra la unicidad global. Ahora la clave incluye la organización.
- Defecto corregido: un objeto ausente o con clave de una versión anterior devolvía 500; ahora es 404 con código.
- Defecto corregido: la descarga en el navegador se cancelaba porque se revocaba la URL del blob en el mismo tick del clic.
- Hecho: la respuesta expone el nombre generado del artefacto, de modo que los cuatro CSV se distinguen en la interfaz.
- Verificación: 149 pruebas del worker (96.31%); 62 del api-backend (96.91%) más 6 de aislamiento contra base real; 53 del frontend (95.9%) más la de navegador; `docker compose config` válido.
- Pendiente: S3-compatible con URLs firmadas, procesamiento asíncrono con callback firmado, historial y autenticación de usuarios.

## 2026-08-26 — Alineación del frontend con el stack acordado y descarga de resultados

- Hecho: se revisó el frontend contra `docs/tecnologias/README.md` y se corrigieron cuatro desvíos: React Hook Form estaba instalado sin usarse, faltaban las convenciones de shadcn/ui, `features/auth` no existía y no había indicador de progreso.
- Hecho: los formularios usan React Hook Form con `zodResolver`; sus esquemas viven en módulos propios para probarlos sin montar la interfaz.
- Hecho: `components.json`, `lib/utils.ts` y tokens de shadcn en CSS; los componentes consumen `primary`, `muted`, `destructive` y `warning` en vez de colores sueltos.
- Hecho: se implementó la descarga de extremo a extremo. El worker sirve un artefacto solo si su manifiesto lo declara, lo que también impide salir del directorio del trabajo.
- Hecho: la API expone `GET /v1/jobs/{jobId}/artifacts/{artifactId}/content`, verifica que el artefacto pertenezca al trabajo y a la organización, y nombra la descarga por trabajo y tipo.
- Decisión: los artefactos de resultado se sirven desde el worker en lugar de duplicarse en el almacenamiento de la API; al conectar S3 ambos lados apuntarán al mismo objeto.
- Hecho: se retiró `@radix-ui/react-dialog`, que estaba declarado sin uso.
- Verificación: 149 pruebas del worker con 96.31%; 42 del api-backend con 96.32%; 50 del frontend con 95.8% y cero advertencias; contrato en vivo de descarga verificado contra el worker real comparando checksums.
- Pendiente: PostgreSQL real, URLs firmadas, login de usuarios e historial.

## 2026-08-26 — Fase 4: frontend React y CORS en la API

- Hecho: se inicializó `frontend` con Vite, React 19, TypeScript estricto, Tailwind 4, Radix, TanStack Query, React Router y Zod.
- Hecho: la carga valida extensión, tamaño y archivo vacío antes de gastar una llamada; el resultado muestra estado, conteos, advertencias explicadas e invariantes evaluadas.
- Decisión: `NEEDS_REVIEW` tiene su propia presentación y nunca se muestra como éxito.
- Decisión: la credencial de servicio vive solo en memoria; no se guarda en almacenamiento del navegador mientras no exista autenticación de usuarios.
- Hecho: toda respuesta del API se valida con Zod y los errores de red no propagan la URL interna.
- Hecho: la API expone CORS por lista explícita de orígenes; sin ella el navegador no podía consumirla.
- Hecho: dos defectos encontrados por las pruebas: el cliente no protegía el parseo del cuerpo en respuestas exitosas y una respuesta simulada reutilizada agotaba su cuerpo.
- Verificación: 42 pruebas de frontend con cobertura 95.62% y cero advertencias de ESLint; `vite build` genera el paquete y el servidor de vista previa sirve HTML, JS y CSS con las utilidades del proyecto.
- Verificación: 34 pruebas del api-backend con cobertura 96.44%; 147 del worker con 96.35%.
- Pendiente: PostgreSQL real, descarga con URLs firmadas, login de usuarios e historial.

## 2026-08-26 — Fase 3: API pública NestJS con Prisma

- Hecho: se inicializó `backend/api-backend` con NestJS 11, TypeScript estricto, ESLint con reglas tipadas, Prettier, Jest y un comando único `npm run check`.
- Hecho: `schema.prisma` implementa el modelo lógico completo con `organizationId` en toda entidad de tenant y claves compuestas que impiden asociaciones entre organizaciones.
- Decisión: se añadieron `api_keys` (hash SHA-256, nunca el valor en claro) y `job_attempts.checks` como `jsonb` versionado; ambas quedaron registradas en `docs/_base_de_datos.md`.
- Hecho: `POST /v1/statements` valida la carga, autoriza por organización, llama al worker y persiste trabajo, intento, advertencias, artefactos, auditoría y outbox en una transacción.
- Hecho: la idempotencia usa `Idempotency-Key` o una huella HMAC con alcance por organización; repetirla devuelve el trabajo anterior sin volver a llamar al worker.
- Hecho: el worker ahora publica el `checksum` SHA-256 de cada artefacto, de modo que la API puede registrar referencias verificables.
- Verificación: 30 pruebas Node aprobadas con cobertura 96.38%; tipos, ESLint, Prettier y `prisma validate` sin errores; 147 pruebas Python en verde.
- Verificación: el contrato entre servicios se probó en vivo contra el worker levantado, incluido el rechazo de un documento no soportado.
- Pendiente: primera migración contra PostgreSQL, aislamiento multi-tenant con base real, S3-compatible, usuarios y callback firmado.

## 2026-08-23 — Fase 2: API interna, cola y trabajo idempotente

- Hecho: configuración tipada `EECC_WORKER_*` con límites validados, sin rutas fijas ni secretos en el código.
- Hecho: puerto de estrategia en `services`, implementación BCP en `extractors/bcp/strategy.py` y registro que resuelve extractores por identificador.
- Hecho: `run_statement_job` publica XLSX y CSV en `artifact_root/<job_id>/` y cierra con un `result.json` de resumen seguro.
- Hecho: la idempotencia deriva de contenido, estrategia y opciones; repetir la entrada devuelve el manifiesto y un directorio sin manifiesto se completa.
- Hecho: API interna FastAPI con límite de tamaño en streaming, limpieza garantizada de temporales y errores traducidos a códigos de dominio.
- Hecho: aplicación Celery con serialización JSON, `acks_late`, prefetch unitario, límites de tiempo y reintentos solo para fallos transitorios.
- Hecho: `docker-compose.yml` con PostgreSQL, Redis y MinIO, verificado con `docker compose config`, y `.env.example` sin credenciales reales.
- Hecho: el adaptador `pdfplumber` traduce cualquier fallo del lector a `INVALID_PDF`; antes un PDF ilegible escapaba como error no tipado.
- Hecho: la limpieza del temporal es un intento y ya no puede reemplazar el error real del escritor.
- Verificación: 146 pruebas aprobadas; cobertura total 96.33%; Ruff y mypy sin errores; prueba de humo real con uvicorn procesando el PDF sintético por HTTP, incluyendo idempotencia y rechazo de un documento no soportado.
- Pendiente: almacenamiento S3-compatible, imágenes de contenedor y el callback firmado hacia NestJS.

## 2026-08-23 — Caracterización ejecutable contra el exportador BCP legacy

- Hecho: `tests/characterization/` ejecuta `formatoBCP (1).py` sin modificarlo sobre el PDF sintético y compara su XLSX con el nuevo.
- Hecho: coinciden conteo de filas, tipos de fila renombrados, página, descripción, fechas, cargo, abono, saldo, totales del resumen y control por página.
- Hecho: se verifican las mejoras documentadas: `Encabezado` con datos identificatorios reemplazada por `Validaciones`, importes en `Decimal` y reconciliación publicada.
- Decisión: el arnés localiza el script legacy por ruta relativa a la raíz y se salta con motivo explícito si faltan `pandas`, `tqdm` o `pdfplumber`.
- Decisión: `numpy` se resuelve con un stub local opaco en `typings/` porque sus stubs reales exigen Python 3.12 y el proyecto se verifica contra 3.11.
- Verificación: 113 pruebas aprobadas; cobertura total 95.85%; Ruff lint/formato y mypy estricto sin errores.
- Pendiente: caracterizar el exportador general legacy y su conversión CSV; iniciar Fase 2 con FastAPI y Celery.

## 2026-08-23 — Exportación CSV y publicación por paquete

- Hecho: se implementó `exporters/csv_export.py` con la biblioteca estándar, derivado del mismo `WorkbookPlan` validado que alimenta al XLSX.
- Hecho: `publish_artifacts_atomically` escribe y verifica todos los temporales antes de mover cualquiera; una verificación fallida no deja salida parcial y una carrera sobre un destino no lo sobrescribe.
- Hecho: se congeló el contrato de salida contra el inventario legacy: hojas, columnas conservadas, columnas retiradas a propósito, formatos declarados y ausencia de columnas identificatorias.
- Hecho: se generaron e inspeccionaron los cuatro CSV del estado de cuenta sintético con BOM, `

` y entrecomillado correcto.
- Decisión: ADR-0003 fija el CSV como adaptador del resultado validado, con `utf-8-sig`, delimitador `,`, fechas ISO-8601, importes con punto y nombres derivados de un identificador validado.
- Verificación: 107 pruebas aprobadas; cobertura total 95.85%; Ruff lint/formato y mypy estricto sin errores.
- Pendiente: comparar numéricamente contra los exportadores legacy, lo que requiere `pandas` y `tqdm` como dependencias de desarrollo y un arnés fuera del worker.

## 2026-08-23 — Escritor físico XLSX y publicación verificada

- Hecho: se implementó `exporters/xlsx_writer.py`, único límite que conoce `openpyxl`, con encabezado fijo, anchos, formatos numéricos, panel congelado y tabla por hoja.
- Hecho: la exportación reabre el archivo y compara hojas, forma, encabezados y valores tipados contra el plan antes de publicarlo atómicamente.
- Hecho: se generó, reabrió e inspeccionó un XLSX real con las cuatro hojas a partir del PDF BCP sintético; el paquete OOXML usa cadenas en línea y sus tablas coinciden con los encabezados.
- Decisión: se usa `openpyxl`, la librería XLSX ya elegida en `docs/tecnologias/README.md`; no se añadió ninguna dependencia nueva de escritura.
- Decisión: el archivo declara autor propio y una marca de creación fija; `openpyxl` sella `modified` al guardar y no se falsea.
- Decisión: `xlsx_writer` no se reexporta desde `exporters/__init__.py` para que el contrato puro siga importándose sin la librería.
- Verificación: 86 pruebas aprobadas; cobertura total 95.39%; Ruff lint/formato y mypy estricto sin errores; hojas renderizadas a PNG para inspección visual.
- Pendiente: exportación CSV como adaptador del mismo resultado validado y caracterización contra los dos exportadores legacy.

## 2026-08-21 — Contrato XLSX seguro para BCP

- Hecho: se creó el esquema versionado `eecc.statement.bcp` con planes tipados para `Resumen`, `Movimientos`, `Control_Paginas` y `Validaciones`.
- Hecho: se neutralizan fórmulas y controles XML en texto no confiable, se conservan importes como `Decimal` y se validan tipos, nombres, formas y límites antes del escritor.
- Decisión: `SUCCEEDED` y `NEEDS_REVIEW` son exportables; `FAILED` nunca genera un workbook vacío.
- Decisión: esta etapa no implementa ni simula el escritor físico porque el runtime autorizado de hojas de cálculo no estuvo disponible; no se generó ningún XLSX.
- Hecho: se implementó publicación atómica con verificación previa, limpieza del temporal y conservación del destino salvo sobrescritura explícita.
- Verificación: 79 pruebas aprobadas; cobertura total 94.87%; Ruff lint/formato y mypy estricto sin errores.
- Pendiente: conectar el escritor físico, publicar atómicamente, reabrir el XLSX e inspeccionar visualmente todas sus hojas.

## 2026-08-21 — Inventario de conversiones legacy

- Hecho: se registraron las cuatro rutas fuente y se verificaron por inspección de código sus entradas, salidas, hojas y responsabilidades.
- Hecho: se confirmó el flujo PDF → XLSX individual/consolidado o especializado BCP, más XLSX → CSV por hoja y diagnóstico XLSX sin conversión.
- Decisión: el dominio queda restringido a estados de cuenta bancarios; PDF, XLSX o CSV ajenos a un esquema compatible no se convierten.
- Decisión: no se atribuirá al legacy una conversión XLSX/CSV → PDF que no existe en los scripts revisados.
- Decisión: la migración conservará semántica y presentación útil, corrigiendo rutas fijas, `float`, fórmula injection, escritura directa y exposición de metadata/rutas.
- Pendiente: crear pruebas sintéticas de caracterización e implementar el exportador XLSX seguro; CSV será un adaptador posterior.

## 2026-08-21 — Adaptador `pdfplumber` BCP

- Hecho: se conectaron saneamiento, lectura de una sola pasada, detección, año del periodo, parseo y reconciliación BCP sin acoplar el extractor a API, colas o almacenamiento.
- Hecho: se añadió un generador ReportLab completamente ficticio y tres pruebas de integración para lectura, resultado reconciliado y limpieza de una envoltura externa.
- Decisión: el adaptador devuelve modelos visuales y métricas seguras por página; las reglas financieras permanecen en el pipeline puro.
- Verificación: 67 pruebas aprobadas; cobertura total 96.32%; Ruff lint/formato y mypy estricto sin errores; PDF sintético de una página renderizado e inspeccionado visualmente.
- Pendiente: implementar la exportación XLSX segura y sus pruebas semánticas.

## 2026-08-21 — Validación y reconciliación BCP

- Hecho: se implementaron invariantes para clasificación, campos, cargo/abono, totales por página y balance global con tolerancia `Decimal`.
- Hecho: se creó un pipeline puro que conecta parseo visual, continuaciones y validación sin depender de `pdfplumber`.
- Decisión: reportes de reconciliación incluyen únicamente códigos, estados y conteos; nunca montos o descripciones.
- Decisión: totales/balances ausentes se marcan `SKIPPED`, discrepancias como `NEEDS_REVIEW` y cero filas como `FAILED`.
- Verificación: 61 pruebas sintéticas aprobadas; cobertura total 97.23%; Ruff lint/formato y mypy sin errores.
- Pendiente: crear el adaptador `pdfplumber` y una prueba de integración con un PDF BCP completamente sintético.

## 2026-08-21 — Layout y filas BCP puras

- Hecho: se migraron palabras PDF tipadas, agrupación vertical, clasificación de columnas y detección de límites de tabla BCP sin importar `pdfplumber`.
- Hecho: se implementaron movimientos, saldos, totales, continuaciones y filas no clasificadas conservando `Decimal`.
- Decisión: fechas inválidas no se consideran continuaciones; las continuaciones no cruzan páginas ni sobrescriben importes en conflicto.
- Verificación: 48 pruebas sintéticas aprobadas; cobertura total 96.5%; Ruff lint/formato y mypy sin errores.
- Pendiente: implementar validación/reconciliación BCP y luego conectar un adaptador `pdfplumber` usando exclusivamente un PDF sintético.

## 2026-08-21 — Decisión de base de datos

- Hecho: se añadió `docs/_base_de_datos.md` con modelo lógico, tipos, índices, idempotencia, aislamiento, migraciones, backups y retención.
- Decisión: PostgreSQL será la fuente de verdad, Prisma será el acceso exclusivo desde NestJS, S3-compatible guardará binarios y Redis permanecerá efímero.
- Decisión: el MVP no persistirá movimientos bancarios individuales en PostgreSQL; conservará metadata segura y artefactos cifrados con retención.
- Hecho: se registró ADR-0002 y se enlazó desde arquitectura, tecnologías, reglas del agente y API backend.
- Pendiente: transformar el modelo conceptual en `schema.prisma` cuando se inicialice NestJS y validar aislamiento multi-tenant con pruebas.

## 2026-08-21 — Núcleo inicial del PDF worker

- Hecho: se inicializó `backend/pdf-worker` con layout `src`, `pyproject.toml`, reglas locales y documentación de arquitectura, migración y pruebas.
- Hecho: se migraron parsing conservador de fechas/importes con `Decimal`, saneamiento PDF no destructivo y detección BCP por confianza/evidencia.
- Hecho: se añadieron modelos y errores de dominio independientes de FastAPI, Celery, Redis, S3, `pdfplumber` y `openpyxl`.
- Verificación: 26 pruebas sintéticas aprobadas; cobertura total 97.6%; Ruff y mypy sin errores.
- Decisión: los permisos `0700` de temporales se aplican solo en POSIX; Windows hereda la ACL del volumen temporal configurado.
- Pendiente: migrar agrupación de palabras, columnas y filas BCP con pruebas sintéticas; no se procesaron archivos bancarios reales.

## 2026-08-21 — Auditoría y base documental

- Hecho: se inventariaron los cuatro scripts Python y los artefactos locales.
- Hecho: se confirmó que los scripts compilan sintácticamente con el Python disponible.
- Hecho: se creó la estructura documental y las carpetas objetivo `backend/api-backend`, `backend/pdf-worker` y `frontend` sin mover el código legacy.
- Decisión: NestJS será la API pública; FastAPI/Celery/Redis formarán el límite interno del worker. No se compartirá una cola BullMQ/Celery.
- Hecho: se agregaron reglas de privacidad y `.gitignore` para evitar versionar documentos financieros y resultados.
- Pendiente: inicializar Git y crear pruebas de caracterización anonimizadas antes de migrar el extractor BCP.
- Pendiente: elegir el primer conjunto de invariantes y construir el esqueleto Python del worker.
