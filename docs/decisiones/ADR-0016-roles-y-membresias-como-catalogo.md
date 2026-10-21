# ADR-0016: Roles y membresías como catálogo, con jerarquía y límites por plan

- Estado: Aceptada
- Fecha: 2026-10-20
- Ampliada por: [ADR-0017](ADR-0017-vigencia-de-la-membresia-y-borrado-del-historial.md), que
  añade la fecha de vencimiento de la membresía de los usuarios normales.
- Amplía: [ADR-0007](ADR-0007-cupo-de-documentos-por-persona.md) (el cupo pasa a depender
  del plan), [ADR-0008](ADR-0008-administrador-y-usuario.md) (los dos roles pasan a ser un
  catálogo con jerarquía) y [ADR-0014](ADR-0014-elegir-que-documento-reemplazar.md).

## Contexto

El responsable del producto pidió tres cosas a la vez:

- **Tipos de membresía.** Dos para empezar: *Básica*, que solo convierte, guarda 3
  documentos y admite hasta 15 páginas por PDF; y *Atlas*, con todo el producto
  (Historial, Centro Financiero, Calendario), 20 documentos y sin límite de páginas.
  Con la advertencia de que habrá más planes y que los actuales cambiarán.
- **Roles que puedan crecer.** Los administradores son el responsable y un par de
  personas de confianza; por encima, un *superadministrador* que gestione incluso a los
  administradores. Y la gestión de permisos, por ahora, solo en el backend.
- **Avisos en pantalla** que digan qué pasó, por qué y el tipo de error, para que una
  persona pueda llamar a soporte y dictar el código.

Hasta aquí el rol era un enum de Postgres (`ADMIN`, `MEMBER`) y el cupo, una variable de
entorno común a todos (`RETAINED_STATEMENTS_PER_USER`). Añadir un rol obligaba a recrear
el tipo; cambiar un cupo, a redesplegar; y no había dónde guardar un plan.

## Decisión

### Catálogos en la base, no enums ni constantes

| Tabla | Qué guarda |
| --- | --- |
| `roles` | código, nombre, descripción, **rango** y plan que propone al dar de alta |
| `permissions` y `role_permissions` | qué acciones administrables concede cada rol |
| `membership_plans` | código, nombre, **documentos que conserva**, **páginas por PDF** (nulo: sin límite), predeterminado, activo y orden |
| `features` y `plan_features` | qué vistas habilita cada plan además de convertir |
| `organization_memberships` | `role_code`, `plan_code` y `plan_changed_at` de cada persona en su organización |

Crear o mejorar un plan o un rol es **insertar o actualizar filas**, no tocar código. Los
**códigos** son el contrato con la API y la interfaz; nombres, descripciones y límites se
cambian en la base sin desplegar.

El código pregunta por **permisos** (`PermissionsGuard`), por **funciones** del plan (la
interfaz) y por **rango** (la gestión de cuentas). Nunca por el nombre de un plan ni de un
rol, salvo para sembrar cuentas.

### Jerarquía por rango

| Rol | Rango | Permisos | Plan que propone |
| --- | --- | --- | --- |
| `SUPER_ADMIN` | 100 | convertir, gestionar cuentas | Atlas |
| `ADMIN` | 50 | convertir, gestionar cuentas | Atlas |
| `MEMBER` | 10 | convertir | ninguno: se elige |

Reglas (`users/member-rules.ts`), aplicadas en el servidor:

- sobre una cuenta de **rango inferior**, todo;
- sobre una del **mismo rango**, solo lo reversible: datos, plan, activar o desactivar y
  contraseña. Es la regla de ADR-0008 («un administrador no elimina ni degrada a otro»)
  generalizada, y conserva sus códigos `ADMIN_CANNOT_BE_DELETED` y `ADMIN_CANNOT_BE_DEMOTED`;
- sobre una de **rango superior**, nada (`ROLE_ABOVE_YOURS`);
- sobre la **propia**, solo datos y plan (`CANNOT_MODIFY_SELF` para lo demás);
- nadie **asigna** un rol de rango superior al suyo.

Así el superadministrador elimina o degrada administradores, y un administrador no toca
a un superadministrador. La lista de usuarios trae, por cuenta, las acciones permitidas
(`actions`) para que la interfaz no duplique estas reglas.

Los superadministradores nacen desde el servidor con un comando idempotente
(`npm run access:super-admins -- <correos>`), porque desde la aplicación nadie asigna un
rol por encima del suyo. Ni la migración ni el código contienen cuentas ni contraseñas.

### Límites del plan, aplicados por el servidor

- **Cupo.** La retención usa `max_retained_statements` del plan de quien sube; al
  superarlo se reemplaza el elegido o, por defecto, el más antiguo, como en ADR-0014. La
  respuesta de la carga dice qué se reemplazó (`replacedStatements`) para avisarlo. Las
  credenciales de servicio no tienen plan y conservan `RETAINED_STATEMENTS_PER_USER`.
- **Páginas.** La API envía `max_pages` al worker, que cuenta las páginas con pdfium
  **antes de extraer** y responde `PDF_PAGE_LIMIT_EXCEEDED` con `page_count` y `max_pages`.
  Rechazar un BCP de 478 páginas tarda décimas de segundo. La API vuelve a comprobar las
  páginas del resultado antes de registrarlo, por si el worker es anterior o no pudo
  contar: el límite no depende de que el otro lado lo cumpla. NestJS sigue sin abrir PDF.
- **Idempotencia.** El límite no entra en la identidad del trabajo del worker: un
  documento que pasa da el mismo resultado con cualquier plan. Repetir una subida
  reutiliza el trabajo y no borra un segundo documento.

### Vistas del plan, aplicadas por la interfaz

Historial, Centro Financiero y Calendario se ofrecen solo si el plan las incluye; quien
llegue por URL ve qué membresía las trae, según el catálogo. La API no las bloquea porque
leen datos que la persona ya puede descargar —sus propios CSV y su propio historial,
que además usa el diálogo de reemplazo—: lo que cuesta (documentos guardados, páginas
procesadas) sí lo aplica el servidor.

### Avisos con datos para soporte

Cada error visible dice qué pasó y qué hacer, y muestra **tipo** (documento, límite de la
membresía, permisos, sesión, conexión, servidor, datos), **código**, **referencia** de la
petición y **hora**, con el teléfono de `SUPPORT_PHONE` y un botón para copiarlo todo. La
referencia es la misma que el servidor escribe en su registro y en la auditoría, así que
soporte encuentra el fallo sin ver el documento. Los errores no se cierran solos y el
mismo fallo no se apila dos veces. Los rechazos explican con números lo que puedan: «el
PDF tiene 132 páginas y tu membresía admite hasta 15», vía `meta` (solo enteros).

### Migración de cuentas existentes

Los administradores pasan a Atlas y los usuarios a Básica, que es la predeterminada. Un
administrador cambia la membresía de cualquiera desde *Usuarios*.

## Cómo crear o mejorar un plan o un rol

Una migración de datos, idempotente:

```sql
-- Un plan nuevo con historial y 10 documentos, o mejorar uno existente.
INSERT INTO "membership_plans"
  ("code", "name", "description", "max_retained_statements", "max_pages_per_document", "sort_order", "updated_at")
VALUES ('PRO', 'Pro', 'Conversión e historial, 10 documentos y hasta 100 páginas por PDF.', 10, 100, 15, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "max_retained_statements" = EXCLUDED."max_retained_statements",
  "max_pages_per_document" = EXCLUDED."max_pages_per_document",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "plan_features" ("plan_code", "feature_code") VALUES ('PRO', 'HISTORY')
ON CONFLICT DO NOTHING;

-- Retirar un plan: deja de ofrecerse, quien lo tiene lo conserva.
UPDATE "membership_plans" SET "is_active" = false, "updated_at" = CURRENT_TIMESTAMP WHERE "code" = 'PRO';

-- Un rol nuevo entre usuario y administrador, solo con permiso de convertir.
INSERT INTO "roles" ("code", "name", "description", "rank") VALUES
  ('SUPERVISOR', 'Supervisor', 'Convierte; reservado para futuras funciones de revisión.', 30)
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "role_permissions" ("role_code", "permission_code") VALUES ('SUPERVISOR', 'STATEMENTS_CONVERT')
ON CONFLICT DO NOTHING;
```

Ni la API ni la interfaz cambian: el alta de usuarios lista roles y planes del catálogo.
Lo que sí exige código es una **función** o un **permiso** nuevos, porque son una vista o
una regla nuevas; se añaden a la vez el código (`FEATURE`, `PERMISSION`) y su fila.

## Alternativas consideradas

- **Ampliar los enums.** Cada rol o plan nuevo sería una migración de tipo y un despliegue,
  y los límites seguirían en constantes. Descartada: es justo lo que se pidió evitar.
- **Plan por organización.** Más simple de facturar, pero aquí cada persona tiene el suyo
  (un cliente Básica y otro Atlas en la misma empresa) y el cupo ya era por persona.
- **Rol con permisos editables desde el panel.** Pedido explícitamente para más adelante.
  El modelo ya lo admite (`role_permissions`); falta la interfaz.
- **Contar las páginas en la API.** Obligaría a NestJS a abrir el PDF, contra la regla de
  capas de AGENTS.md. El worker ya lo abre y lo cuenta sin coste.
- **Bloquear las vistas también en la API.** Las vistas leen los mismos datos que las
  descargas y el diálogo de reemplazo; bloquear el historial rompería el reemplazo de la
  Básica sin proteger nada que la persona no pueda ya descargar.
- **Crear los superadministradores en la migración.** Metería cuentas de un entorno
  concreto y una contraseña en el esquema. Se hace con un comando del servidor.

## Consecuencias

- `MembershipRole` desaparece del esquema; `organization_memberships.role` pasa a
  `role_code` con clave foránea al catálogo.
- La sesión (`/v1/auth/me`) trae `roleName`, `roleRank`, `permissions`, `plan` y
  `supportPhone`; `retainedStatementsPerUser` sigue, ahora con el cupo del plan.
- Nacen `GET /v1/plans` (con sesión), `GET /v1/roles` (solo los asignables) y
  `GET /v1/support` (pública), y `planCode` en el alta y la edición de cuentas.
- Bajar de plan no borra nada en el acto: el exceso se retira en la siguiente subida,
  empezando por el elegido. La interfaz lo advierte al cambiar el plan y en el diálogo.
- Los usuarios que existían pierden Historial, Centro y Calendario hasta que se les asigne
  Atlas.
- Borrarse a uno mismo responde `CANNOT_MODIFY_SELF` (antes, para un administrador,
  `ADMIN_CANNOT_BE_DELETED`).
- `RETAINED_STATEMENTS_PER_USER` pasa a ser solo el cupo de las credenciales de servicio.

## Criterio de revisión

Revisar cuando un plan tenga precio o **vigencia** (fecha de vencimiento y vuelta al plan
predeterminado), cuando una función nueva lea datos que la persona no pueda obtener por
otra vía —entonces debe bloquearse también en la API—, o cuando se pida administrar
permisos desde el panel.
