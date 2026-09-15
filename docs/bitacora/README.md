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
