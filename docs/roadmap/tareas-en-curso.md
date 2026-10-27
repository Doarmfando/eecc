# Tareas en curso: roles, membresías y avisos

Lista viva del trabajo pedido por el responsable del producto el 2026-10-20. **Léela
al empezar cualquier sesión y marca lo que se termine** (`[x]`), con una línea de
evidencia si hace falta. Lo que se descarte se tacha y se explica; no se borra.
Cada pedido nuevo se anota primero en «Pedidos, tal como llegaron» y después se
convierte en tarea: así se puede comprobar que no se perdió ninguno.

Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` hecho y verificado · `[?]` duda abierta.

## Pedidos, tal como llegaron

Cada línea es una frase del pedido y la tarea que la cubre (§ = sección de abajo).

**Mensaje 1**

- «Diseña y prepara la BD para tipos de usuarios, roles y tipos de membresías» → §1.
- «El único admin seré yo y un par de amigos» → §1 roles, §2 CLI de superadmins.
- «Los roles serán para usuario; tipo de membresía para saber qué usuario tiene tal
  membresía; de momento 2: Básica y Atlas» → §1.
- «La Básica: límite de 3 cargas, solo hace las conversiones, no tiene las demás
  vistas y funciones; la Atlas sí tiene todo» → §1 planes, §4 vistas por plan.
- «Usa los roles porque en el futuro capaz crece» → reglas generales «Escalable».
- «En la pantalla agrega un alert cuando pasa algo y notifica el porqué, además del
  tipo de error, para mantenimiento y que nos puedan llamar por teléfono» → §2
  `SUPPORT_PHONE`, §4 avisos.
- «Al terminar realiza pruebas con las carpetas que tenemos» → §5.
- «El límite es de 3 conversiones, pero se pueden más: la 4.ª (Básica) reemplaza» → §2
  cupo, §4 diálogo.
- «Plan Atlas: lista premium de 20 conversiones totales» → §1, §2.
- «En la 4.ª o la última de Atlas siempre reemplaza la más antigua, pero siempre
  dando alerta, comunicando y dando opción a reemplazar la que guste; predeterminado
  para que baste un Enter y sea rápido» → §4 diálogo.
- «Pruebas con la carpeta C:\Users\brand\Downloads\prototipo testeo» → §5.
- «Límite de hojas: Básica 15 páginas por archivo, Atlas ilimitado; todo puede
  escalar rápido» → §1, §2, §3.
- «Arma un plan de trabajo y empieza cada uno sin detenerte hasta acabar» → forma de
  trabajo (abajo).

**Mensaje 2**

- «No olvides la regla de idempotencia y patrones de mejora donde sea necesario» →
  reglas generales «Idempotencia» y «Patrones de solución».

**Mensaje 3**

- «Hazlo escalable: los planes posiblemente se mejoren o se creen en el futuro» →
  reglas generales «Escalable», §6 guía para crear o cambiar un plan.
- «Pon tiempo al momento de crear un usuario» → `[?]` leído como «pon **tipo**» (rol y
  plan obligatorios en el alta). Si era **vigencia** del plan (fecha de vencimiento),
  falta: ver «Dudas abiertas».
- «Que siempre me pida asignarle un plan o rol: si quiero otro admin para mi empresa,
  Atlas; si es usuario, plan Básica, Atlas o los que existan» → §2 alta, §4 Usuarios.
- «Además de que se pueda…» (frase cortada) → `[?]` interpretado como «que se pueda
  cambiar después»: §2 y §4 edición de rol y plan.
- «De momento no hagas que se administren los permisos desde el panel de admin; solo
  haz bien el back escalable» → §2 permisos solo en backend.
- «El administrador puede hacerlo todo» → §1 permisos del ADMIN, plan Atlas sugerido.
- «Crea otro rol que sea Super Admin y 2 usuarios brando@hotmail.com y
  fabio@hotmail.com; ahí administraremos incluso a los admins» → §1 rol, §2 rangos y CLI.

**Mensaje 4**

- «Organízalo en una lista de tareas o agente y MD fijo para que siempre tengas
  lectura y check de tareas» → este archivo, enlazado desde `CLAUDE.md`.

**Mensaje 5**

- «¿Pusiste o anotaste todo lo que te dije? Dale prioridad para no perder el hilo» →
  sección «Pedidos, tal como llegaron» (esta).

**Mensaje 6** (respuesta a las dudas)

- «El 1 sí: pon fecha de vencimiento para que los admins vean eso en cada uno de los
  usuarios nuevos normales que no sean admins» → §8 vigencia de la membresía.
- «Lo 2.º ya está así, normal» → duda cerrada.
- «Además quería que agregues para borrar la lista del historial de archivos cuando
  alguien carga algo» → §9 borrar documentos del historial.

**Mensaje 7**

- «Lo demás te dejo a tu criterio» → decisiones de §8 y §9 tomadas aquí y en ADR-0017.

**Mensaje 8**

- «Puedes comitear y pushear» → §7: commit y push del trabajo verificado (fetch y rebase
  antes, porque otra persona sube a `main` en paralelo).

**Mensaje 11**

- «¿Qué pasó con la cuenta de Ronald?» / «¿No le quitamos ningún archivo?» → respondido:
  pasó a Básica con vigencia ficticia; ningún archivo tocado.

**Mensaje 12**

- «¿Qué pasó aquí en Juanito Alimaña? Compara, revisa y analiza la carpeta de muestras:
  qué tiene de malo ese archivo (BCP mayo, «Requiere revisión»)» → §13.

**Mensaje 13**

- «El sistema debería poder interpretar correctamente eso, pero dar un aviso para que el
  usuario pueda continuar rápidamente con un Enter, o cancelar, o volver a intentar, o
  proceder con la alerta» → §14.

**Mensaje 14** (2026-10-26, conversación con quien hizo el calendario, con captura del
calendario en diciembre de 2026)

- «Supongamos que es enero: en el estado de cuenta de enero 2026 vino un movimiento que
  recién procesa del 31 de diciembre de 2025, y lo marca como si fuese del 31 de
  diciembre de 2026» → §15.
- «Pendiente», «acumulado» «y una vista en tabla»: «eso es front, lo armo y lo arreglas,
  así como cuando hice el calendario» → §16. Lo arma la otra persona; aquí se revisa y se
  corrige después.
- «Y también útil a dos más de contabilidad» → contexto: lo usarán dos personas más de
  contabilidad (§16).

**Mensaje 10**

- «Esta raya del sidebar que está encima de la animación, quítala» → §12.

**Mensaje 9**

- «Hazlo todo tú, pon números ficticios» → §11: desplegar en Railway, crear los
  superadmins en producción, `SUPPORT_PHONE` ficticio y fechas de vencimiento en las
  cuentas existentes.

## Forma de trabajo

- [x] Plan de trabajo armado y ejecutado de corrido, sin pausas para preguntar.
- [x] Antes de cada bloque, releer esta lista; al recibir un pedido nuevo, anotarlo aquí
  primero. (Regla permanente: sigue valiendo para los próximos pedidos.)

## Dudas abiertas

- [x] «Pon tiempo»: era **vigencia** del plan (mensaje 6) → §8. Además del tipo, que ya
  se pide.
- [x] «Además de que se pueda…»: confirmado que era cambiar rol y plan después; ya está.

## Reglas que aplican a todas las tareas

- [x] **Idempotencia** (`docs/calidad/fallos-y-trampas.md`): un reintento no crea filas,
  trabajos, borrados ni avisos duplicados. Migración atómica con semillas
  `ON CONFLICT`; subida reintentada reutiliza el trabajo; descartes y `PATCH` sin efecto
  si nada cambia; CLI re-ejecutable; avisos sin duplicar. Probado (unitarias y real).
- [x] **Patrones de solución**: `patrones-de-solucion.md` (idempotencia ampliada, catálogo
  en vez de enum, límite en dos capas, jerarquía por rango, avisos para soporte) y
  `fallos-y-trampas.md` (deriva de `@updatedAt`, `pg_restore --clean`, PowerShell y
  stderr, consola cp1252, proxy de Vite, prefijo `sr-only`).
- [x] **Escalable**: roles, permisos, planes y funciones son filas de catálogo. Crear o
  mejorar un plan o un rol es una migración con `INSERT … ON CONFLICT DO UPDATE`, sin
  tocar código. La interfaz lee nombres, límites y funciones de la API.
- [x] Sin datos bancarios en registros, pruebas ni documentación (AGENTS.md): las pruebas
  reales solo imprimen códigos, estados, conteos y tiempos; los usuarios de prueba se
  borraron con sus documentos.

## 1. Base de datos

- [x] Catálogos `roles`, `permissions`, `role_permissions`, `membership_plans`,
  `features`, `plan_features`; la membresía de organización apunta a rol y plan.
- [x] Migración de datos: ADMIN → Atlas, MEMBER → Básica. Sin deriva frente a Prisma.
- [x] Jerarquía de roles (`roles.rank`) y plan sugerido por rol (`roles.default_plan_code`).
- [x] Rol `SUPER_ADMIN` (rango 100, Atlas): administra incluso a los administradores.
  ADMIN (50, Atlas) y MEMBER (10, plan a elegir).
- [x] El administrador puede hacerlo todo: convertir y gestionar cuentas
  (`STATEMENTS_CONVERT`, `USERS_MANAGE`), con Atlas sugerido.
- [x] Planes iniciales: **Básica** (solo conversión, 3 documentos, 15 páginas por PDF) y
  **Atlas** (todo, 20 documentos, sin límite de páginas).

## 2. API (NestJS)

- [x] Sesión con rol, rango, permisos y plan; guard por permisos en vez de por rol.
- [x] Cupo por plan (3 / 20). Al superarlo se reemplaza: por defecto el más antiguo o el
  que elija la persona; la respuesta dice qué se reemplazó.
- [x] Límite de páginas del plan enviado al worker + verificación de respaldo en la API.
- [x] Errores con código, referencia y `meta` numérica (páginas, límite).
- [x] `GET /v1/plans`, `GET /v1/roles` (solo los asignables), `GET /v1/support`
  (teléfono `SUPPORT_PHONE`).
- [x] Alta de usuario: rol y plan; sin plan indicado se usa el sugerido por el rol. (La
  interfaz los pide siempre: §4.)
- [x] Reglas por rango (`member-rules.ts`): solo se gestionan cuentas de rango inferior;
  con el mismo rango, solo lo reversible (nombre, plan, activar/desactivar, contraseña).
  Nadie asigna un rol por encima del suyo. Acciones permitidas por cuenta en la lista.
- [x] CLI idempotente `super-admins` (`npm run access:super-admins -- <correos>`): crea o
  promueve `brando@hotmail.com` y `fabio@hotmail.com` como `SUPER_ADMIN` con Atlas
  (contraseña generada, se muestra una vez). Probado y ejecutado en local dos veces: la
  segunda no cambia nada. En producción falta ejecutarlo (`node dist/cli/super-admins.js`).
- [x] Permisos administrables **solo en backend** (sin panel).

## 3. Worker (Python)

- [x] `max_pages` → `PDF_PAGE_LIMIT_EXCEEDED` (422) antes de extraer, con páginas y límite;
  el límite no entra en la identidad del trabajo (idempotente).
- [x] Pruebas con PDF sintéticos; `scripts\check.ps1` en verde (369 pruebas, 93,6 %).

## 4. Frontend

- [x] Avisos (alertas) en pantalla cuando pasa algo: qué pasó, por qué, qué hacer, tipo de
  error, código, referencia, hora y teléfono de soporte, con botón para copiar. Los errores
  no se cierran solos; el mismo fallo no se apila dos veces.
- [x] Vistas según el plan: Básica solo conversión; Atlas Historial, Centro Financiero y
  Calendario. Ruta bloqueada explica qué plan la incluye (según el catálogo).
- [x] Plan visible para la persona: barra lateral, menú de cuenta y junto al formulario.
- [x] Al llegar al cupo (4.ª en Básica, 21.ª en Atlas): diálogo con el más antiguo elegido
  y Enter para confirmar; lista con scroll; aviso de lo reemplazado y de lo convertido.
- [x] Usuarios: alta con rol y plan **obligatorios** (plan sugerido por rol: Admin →
  Atlas; Usuario → elegir entre los que existan), columnas de rol y membresía, edición de
  rol y plan, botones según las acciones que permite la API. Sin gestión de permisos.
- [x] Frontend `npm run check` en verde (272 pruebas, cobertura 96 %).

## 5. Verificación

- [x] API `npm run check` (240 pruebas, 95,9 %) + 9 de aislamiento contra PostgreSQL local,
  worker `scripts\check.ps1` (369, 93,6 %), frontend `npm run check` (272, 96 %).
- [x] Prueba real con `C:\Users\brand\Downloads\prototipo testeo` (6 PDF, 47 comprobaciones):
  Básica rechaza BN (132 págs) y BCP (457 y 478) en ≤0,1 s y convierte los 3 BBVA;
  reemplaza en la 4.ª; Atlas procesa los 6, llega a 20 y reemplaza en la 21.ª.
- [x] Superadmin degrada a un admin; un admin no toca ni crea superadmins ni elimina a otro
  admin.
- [x] Revisión visual en navegador con Playwright a 1366 y 375 px (18 comprobaciones, sin
  errores de consola ni desbordes).

## 6. Documentación

- [x] ADR-0016 (roles y membresías como catálogo, jerarquía, límites por plan).
- [x] Guía «cómo crear o mejorar un plan o un rol» (en ADR-0016).
- [x] Bitácora, README, EJECUTAR, `_base_de_datos.md`, Railway, `.env.example`, patrones y
  trampas.

## 7. Pendiente fuera de este entorno

- [x] Commit y push a `main` del trabajo de roles y membresías (`5307cb5`).
- [ ] Despliegue: worker → API (aplica las migraciones `roles_y_membresias` y
  `vigencia_de_membresia`) → frontend. En el servicio de la API:
  `node dist/cli/super-admins.js brando@hotmail.com fabio@hotmail.com` y guardar las
  contraseñas que imprime. Definir `SUPPORT_PHONE`.
- [ ] Revisar en *Usuarios* qué cuentas existentes deben pasar a Atlas (hoy: los usuarios
  quedaron en Básica, los administradores en Atlas) y ponerles fecha de vencimiento
  (quedaron «Sin vencimiento»).
- [x] Dudas abiertas respondidas (mensaje 6).

## 8. Vigencia de la membresía (mensaje 6)

- [x] Fecha de vencimiento por persona en la BD; solo para roles que la exigen (hoy
  `MEMBER`). Administradores y superadmins no vencen.
- [x] Alta de un usuario normal: la vigencia es obligatoria (atajos 1, 3, 6 y 12 meses o
  una fecha). Edición: renovar o cambiar la fecha.
- [x] Los admins la ven en cada cuenta: «vence el …», «vence en N días», «venció el …»; y
  un filtro de vencidas.
- [x] Al vencer: no puede convertir (`MEMBERSHIP_EXPIRED`), pero entra y conserva lo
  suyo. La persona ve el aviso antes (por vencer) y después (vencida) con el teléfono.
- [x] Fecha según la zona horaria del negocio (`BUSINESS_TIMEZONE`, Lima).
- [x] Pruebas, prueba real (26 comprobaciones) y capturas (18).

## 9. Borrar documentos del historial (mensaje 6)

- [x] API: borrar un documento propio o todos los propios, con sus archivos; idempotente
  (repetir no falla) y auditado sin nombres.
- [x] Historial: botón para borrar cada documento y «Vaciar historial», con confirmación.
- [x] Resultado de una conversión: «Borrar este documento» (sirve también a la Básica,
  que no tiene Historial).
- [x] Aviso de lo borrado; las vistas que leen esos documentos se refrescan.
- [x] Pruebas, prueba real y capturas.

## 10. Cierre

- [x] Checks (API 257 + 9 de aislamiento, frontend 290; worker sin cambios), bitácora,
  ADR-0017, README, EJECUTAR, `_base_de_datos.md`, Railway, `.env.example`, patrones y
  trampas.
- [x] Commit y push.

## 11. Despliegue en producción (mensaje 9)

- [~] Respaldo de la base de producción antes de migrar: **no posible** sin SSH (exige que
  una persona vincule la clave en la web) ni acceso público a la base; PITR desactivado.
  Migraciones transaccionales y sin borrado de datos. Pendiente: activar copias.
- [x] Worker primero (`max_pages`, hojas comunes del 18-19 de octubre) y redespliegue con
  la corrección de las banderas de exportación (FastAPI 0.156).
- [x] Variables de la API: `SUPPORT_PHONE=+51 900 000 000` (ficticio),
  `BUSINESS_TIMEZONE=America/Lima`, `PROFILE_VERSION=statements-2026.10.18`.
- [x] API y frontend; migraciones `statement_source_file_name`, `roles_y_membresias` y
  `vigencia_de_membresia` aplicadas al arrancar.
- [x] Superadmins `brando@hotmail.com` y `fabio@hotmail.com` creados con
  `BOOTSTRAP_SUPER_ADMINS` (variable retirada después); contraseñas fuera del repo.
- [x] Vigencia ficticia (31-12-2026) a los 5 usuarios normales existentes.
- [x] Prueba de humo en producción con PDF sintéticos: 16 comprobaciones.
- [x] Bitácora, trampas, Railway; commit y push.
- [ ] Del responsable: cambiar las contraseñas iniciales, poner teléfono y fechas reales,
  decidir quién pasa a Atlas, retirar `BOOTSTRAP_ADMIN_PASSWORD`, activar copias.

## 12. Ajuste visual (mensaje 10)

- [x] Quitar la línea horizontal sobre la animación del pie de la barra lateral
  (`border-t` de `SidebarConversionArt`) y desplegarlo.

## 13. Análisis del BCP de mayo en «Requiere revisión» (mensaje 12)

- [x] Reprocesado con el código actual: cargos cuadran al céntimo; abonos impresos y saldo
  final superan a los movimientos; la pág. 424 trae 16 movimientos
  frente a 35 en todas las intermedias.
- [x] La otra herramienta (`2026_MAYO_BCP.xlsx`) lee lo mismo (16.710 movimientos, mismos
  totales, 16 en la pág. 424) pero no avisa, y su «último saldo» es el saldo anterior.
- [x] Pág. 424: dos huecos en blanco (≈19 renglones) sin ningún carácter, ni oculto ni
  fuera de página; pdfium también lee 16. Faltan en el PDF que entregó el banco.
- [x] Conclusión: **fallo del documento, no del extractor**; «Requiere revisión» es correcto.
  Acción: volver a descargar el estado de cuenta del banco. Mejora posible: un aviso que
  señale la página incompleta y un mensaje propio para `BCP_BALANCE_MISMATCH`.

## 14. Aviso de resultado con discrepancias (mensaje 13)

- [x] Worker: cuando los totales no cuadran, señalar las páginas intermedias con menos
  movimientos que las demás (`BCP_PAGE_INCOMPLETE`, con página). Versión BCP nueva.
- [x] API: guardar y devolver los avisos con su página (sin importes).
- [x] Diálogo al terminar una conversión con discrepancias: qué pasó en palabras simples,
  cuánto falta (calculado en el navegador desde el `Resumen` publicado) y tres salidas:
  **Continuar** (Enter), **Volver a intentar** (otro PDF que reemplaza a este) y
  **Cancelar** (borra esta conversión).
- [x] Mensajes claros para `BCP_BALANCE_MISMATCH` y el aviso nuevo.
- [x] Pruebas, prueba real con el BCP de mayo, despliegue, bitácora, commit y push.
- [x] Revisión independiente del cambio y sus correcciones (conteo de avisos, reutilizados,
  consejo según el aviso, límites de página). BCP `0.5.2`, `statements-2026.10.21.2`.

## 15. Año de un movimiento del mes anterior (mensaje 14)

- [x] Worker: una fecha sin año toma el año que la deja más cerca del periodo del
  documento, no el año del cierre. BCP y Banco de la Nación (BBVA ya lo resolvía con la
  fecha de emisión; Interbank imprime el año).
- [x] Pruebas con PDF sintético: periodo de enero con un movimiento del 31 de diciembre.
  Fallan con el código anterior (salía 31-12-2026) y pasan con el arreglo. Worker 393
  pruebas, API 268.
- [x] Versiones nuevas: BCP `0.5.3`, Banco de la Nación `0.4.1`,
  `statements-2026.10.26`, para que volver a subir el PDF lo convierta de nuevo en vez
  de reutilizar el resultado con el año mal.
- [x] Bitácora, trampas y nota de despliegue en Railway.
- [ ] Commit y push.
- [ ] Despliegue: worker y después la API con `PROFILE_VERSION=statements-2026.10.26`.
- [ ] Del responsable: borrar del Historial los documentos de enero ya convertidos y
  volver a subirlos (si quedan los dos, el calendario cuenta los movimientos dos veces).

## 16. Vistas «pendiente», «acumulado» y tabla (mensaje 14)

- [ ] Las arma en el frontend la otra persona, como el calendario. Al llegar a `main`:
  revisarlas, corregirlas y pasar `npm run check`.
- [?] Qué es «pendiente» y «acumulado»: confirmar con el diseño cuando llegue. Lectura
  provisional: «pendiente», los movimientos que un documento trae de otro periodo (como
  el del 31 de diciembre en el de enero); «acumulado», el saldo que se arrastra día a
  día; la tabla, los movimientos del mes en filas.
