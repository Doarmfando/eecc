# ADR-0008: Dos roles, administrador y usuario, y gestión completa de cuentas

- Estado: Aceptada
- Fecha: 2026-09-12

## Contexto

[`ADR-0005`](ADR-0005-identidad-de-usuarios-y-sesiones.md) dejó cuatro roles (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`) heredados del esquema inicial. En la práctica solo había dos comportamientos: `VIEWER` no se aplicaba en ninguna ruta —podía subir documentos igual que un `MEMBER`— y `OWNER` solo se distinguía de `ADMIN` en la protección del último propietario. Además, el arranque y la semilla creaban cada cuenta inicial como `OWNER`, así que una instalación con varias altas hechas por esas vías acababa con varios propietarios que nadie había elegido.

La gestión de cuentas se quedaba corta para quien la usa: no se podía corregir el nombre ni el correo de nadie, ni eliminar una cuenta, ni ver cuántos documentos conservaba cada persona, y la contraseña solo se podía regenerar, no fijar.

## Decisión

**Dos roles.** `ADMIN` gestiona las cuentas de la organización; `MEMBER` procesa documentos y consulta el historial. Solo `ADMIN` alcanza `/v1/users`.

**Migración de datos.** En cada organización queda como `ADMIN` una sola cuenta: la de rol más alto y, a igualdad, la activa más antigua —la cuenta inicial del arranque o la semilla—. Todas las demás pasan a `MEMBER`. Luego el enum se recrea sin `OWNER` ni `VIEWER`. Así ninguna organización se queda sin quien gestione sus cuentas, y ninguna conserva administradores que no eligió.

**Qué puede hacer un administrador:**

- crear cuentas de usuario o de administrador, con contraseña generada (se muestra una vez) o escrita por él;
- cambiar nombre, correo y contraseña de cualquier cuenta; fijar la contraseña cierra las sesiones de esa persona y levanta el bloqueo por intentos;
- desactivar y reactivar; desactivar cierra sus sesiones en el acto;
- ascender un usuario a administrador;
- eliminar un usuario, lo que borra también sus documentos —PDF, resultados y filas— con la misma rutina que aplica el cupo de [`ADR-0007`](ADR-0007-cupo-de-documentos-por-persona.md);
- ver cuántos documentos conserva cada cuenta.

**Protecciones, aplicadas en el servidor:**

- un administrador **nunca se elimina** (`ADMIN_CANNOT_BE_DELETED`) **ni se degrada** (`ADMIN_CANNOT_BE_DEMOTED`). Lo segundo es consecuencia de lo primero: si se pudiera degradar, eliminarlo quedaría a dos pasos. Sí se puede desactivar, que es reversible y es la vía para retirar a un administrador que se va;
- nadie se cambia el rol, se desactiva ni se fija la contraseña a sí mismo desde la gestión (`CANNOT_MODIFY_SELF`); la propia contraseña se cambia desde la cuenta, que exige la actual. Como quien actúa es siempre un administrador activo, esto basta para que ninguna organización se quede sin administradores activos;
- nombre, correo y contraseña son de la persona, no de su membresía: si la cuenta pertenece también a otra organización, no se cambian desde aquí (`MEMBER_IN_OTHER_ORGANIZATION`). Si no, el administrador de una organización podría tomar la cuenta que esa persona usa en otra.

**Eliminar** primero desactiva y cierra sesiones, luego borra los documentos y al final la membresía; la fila de la persona solo desaparece si no pertenece a ninguna otra organización. Si el borrado de archivos falla a medias, la cuenta queda desactivada —un estado seguro— y se puede reintentar.

**Auditoría.** `member.updated` registra qué campos cambiaron, no sus valores: el correo es un dato personal y la auditoría no lo necesita para ser útil. Se añade `member.deleted` con el número de documentos borrados.

**Recuperación.** Si se pierde la contraseña del único administrador, la semilla la fija cuando `SEED_ADMIN_PASSWORD` está puesta a propósito, aunque la cuenta exista. Sin esa variable sigue sin tocar ninguna contraseña existente.

## Alternativas consideradas

- **Conservar los cuatro roles**: dos de ellos no cambiaban nada, y un rol sin efecto hace creer que existe una restricción que no existe. Descartada.
- **Proteger solo contra la eliminación, permitiendo degradar**: dejaba la regla a dos clics de saltarse. Descartada.
- **Prohibir también desactivar a un administrador**: no quedaría forma de retirar el acceso a uno que se marcha sin tocar la base a mano. Descartada; desactivar es reversible y no pierde datos.
- **Conservar los documentos de una cuenta eliminada con `uploadedBy` nulo**: quedarían en el grupo de las credenciales de servicio, sin dueño visible y fuera del cupo de nadie. Contradice la minimización de [`ADR-0002`](ADR-0002-postgresql-prisma-y-minimizacion-financiera.md). Descartada.
- **Solo contraseñas generadas**, como fijaba ADR-0005: evita que la definitiva pase por manos del administrador, pero es justo lo que se pidió poder hacer. Se ofrecen ambas; la generada sigue siendo la opción por defecto, y la persona puede cambiarla desde su cuenta.

## Consecuencias

- Esta decisión reemplaza, de ADR-0005, la parte de roles y la de «el administrador no fija contraseñas». El resto de ADR-0005 —sesión opaca, cookie `httpOnly`, bloqueo por intentos— sigue en vigor.
- Una instalación en marcha cambia de roles al desplegar: todas las cuentas salvo la administradora de cada organización pasan a usuario. Quien deba administrar tendrá que ser ascendido por ella.
- La interfaz pasa de *Personas* a *Usuarios* (`/usuarios`; `/personas` redirige) y el menú de cuenta permite por fin cambiar la propia contraseña, que la pantalla de entrada pedía hacer sin ofrecer dónde.
- `POST /v1/users/{userId}/password-reset` acepta un cuerpo opcional `{ password }`; `temporaryPassword` pasa a ser nulo cuando no se generó. Nace `DELETE /v1/users/{userId}`.

## Criterio de revisión

Revisar si aparece la necesidad de un rol de solo lectura con efecto real, o si una persona necesita administrar varias organizaciones: hoy la protección de cuentas compartidas simplemente impide editarlas desde cualquiera de ellas.
