# ADR-0017: Vigencia de la membresía y borrado del historial por su dueño

- Estado: Aceptada
- Fecha: 2026-10-21
- Amplía: [ADR-0016](ADR-0016-roles-y-membresias-como-catalogo.md) (la membresía tiene
  fecha de vencimiento) y [ADR-0007](ADR-0007-cupo-de-documentos-por-persona.md) (además
  del cupo, la persona puede borrar sus documentos cuando quiera).

## Contexto

El responsable del producto pidió dos cosas, y dejó el resto a criterio:

- **Fecha de vencimiento** de la membresía de los usuarios normales, a la vista de los
  administradores en cada cuenta. Los administradores no vencen.
- **Borrar documentos del historial** de lo que alguien cargó.

## Decisión

### Vigencia

- Cada membresía de organización tiene `plan_expires_on` (`DATE`, nulo: no vence): el
  **último día** en que vale. El catálogo de roles dice quién la lleva
  (`roles.plan_expiry_required`): hoy `MEMBER` sí, `ADMIN` y `SUPER_ADMIN` no. Un rol que
  no vence nunca guarda fecha, aunque se envíe; ascender a administrador la quita.
- **Alta de un usuario normal:** la fecha es obligatoria y de hoy en adelante
  (`PLAN_EXPIRY_REQUIRED`, `PLAN_EXPIRY_IN_PAST`, `PLAN_EXPIRY_INVALID`). La interfaz
  propone un mes y ofrece atajos de 1, 3, 6 y 12 meses o una fecha.
- **Edición:** renovar, cambiar o quitar la fecha requiere poder cambiar la membresía
  (`CHANGE_PLAN`, mismas reglas de rango). Se admite una fecha pasada: es la forma de
  cortar el acceso sin desactivar la cuenta. Los atajos de renovación cuentan desde el
  vencimiento actual si aún no pasó, para no regalar ni quitar días.
- **Al vencer**, la persona sigue entrando y conserva lo suyo (historial, descargas,
  Centro Financiero si su plan lo tiene), pero **no convierte**: la API responde
  `MEMBERSHIP_EXPIRED` (403) antes de procesar, también al repetir un PDF ya convertido,
  y el rechazo queda auditado. La interfaz lo explica antes de que lo intente y
  deshabilita la carga; siete días antes avisa de que vence.
- **«Hoy» es el día del negocio**, no el del servidor: `BUSINESS_TIMEZONE` (por defecto
  `America/Lima`). Railway corre en UTC; sin esto, una vigencia «hasta el 20» caducaría
  el 20 a las 19:00 de Lima. Se revisa en cada petición, como el rol: renovar o vencer
  surte efecto en la siguiente, sin volver a entrar.
- Las cuentas que ya existían quedan **sin vencimiento**: no se inventa una fecha. La
  gestión de usuarios las muestra como «Sin vencimiento» para fijarla.

### Borrado del historial

- `DELETE /v1/statements/{statementId}` borra un documento **propio**;
  `DELETE /v1/statements`, **todos** los propios. Cada uno se va entero —PDF, Excel, CSV y
  fila—, con la misma rutina que el cupo; los archivos del worker que otro documento
  comparte se conservan.
- La búsqueda filtra por organización y dueño: un identificador ajeno no borra nada, ni
  siquiera para un superadministrador (para eso está eliminar la cuenta).
- **Idempotente:** responde `{ deletedCount }` y repetir da `0`, sin error. Si un borrado
  falla, se intentan los demás y se responde `STATEMENT_DELETE_FAILED`; repetir termina.
- Se audita `statement.deleted` con cuántos y el alcance (`one`/`all`), nunca el nombre.
- La interfaz lo ofrece en el **Historial** (por documento y «Vaciar historial») y en el
  **resultado de una conversión** («Borrar este documento»), que es donde lo ve la Básica,
  sin Historial. Siempre con confirmación y el foco en «Cancelar».

## Alternativas consideradas

- **Al vencer, bajar al plan predeterminado.** Supone que la Básica es gratuita, y no
  consta. Bloquear la conversión es reversible, explícito y no cambia los límites de nadie
  por sorpresa; si se decide otra política, es un cambio acotado en un solo punto.
- **Al vencer, no dejar entrar.** La persona perdería el acceso a sus propios documentos y
  no vería por qué; con la sesión abierta lo lee en pantalla con el teléfono de soporte.
- **Fecha con hora (`timestamptz`).** Una membresía se vende por días; una hora invita a
  ambigüedades de zona horaria. `DATE` y el día del negocio lo dejan claro.
- **Borrado lógico (marcar y ocultar).** Contradice la minimización de ADR-0002: los
  archivos financieros seguirían en disco. Se borra de verdad.

## Consecuencias

- Migración `vigencia_de_membresia`: dos columnas y el valor del catálogo; idempotente.
- La sesión trae `plan.expiresOn` y `plan.expired`; la lista de usuarios,
  `planExpiresOn`, `planExpired` y `planExpiryRequired`; los roles, `planExpiryRequired`.
- El CORS admite `PATCH` y `DELETE`, que la gestión de usuarios ya usaba.
- No hay aviso por correo ni tarea programada: el vencimiento se evalúa al pedir. Si se
  quiere avisar antes por otro canal, hará falta un planificador.

## Criterio de revisión

Revisar si la membresía pasa a cobrarse (renovación automática, historial de períodos),
si se decide otra política al vencer, o si hace falta poder recuperar un documento
borrado por error, que hoy no se puede.
