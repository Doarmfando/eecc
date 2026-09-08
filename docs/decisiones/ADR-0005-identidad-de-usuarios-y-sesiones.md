# ADR-0005: Identidad de usuarios con sesión opaca en cookie httpOnly

- Estado: Aceptada
- Fecha: 2026-09-08

## Contexto

Hasta ahora la API se autorizaba con una credencial de servicio (`x-api-key`) con alcance de organización. Todo el mundo compartía la misma credencial, así que ninguna acción quedaba atribuida a nadie: `Statement.uploadedBy` y `AuditEvent.actorUserId` existían en el esquema desde [`ADR-0002`](ADR-0002-postgresql-prisma-y-minimizacion-financiera.md) y ningún código los rellenaba.

Con documentos bancarios, saber quién subió qué no es un extra: es el requisito que convierte la auditoría en algo utilizable. El esquema ya preveía `User`, `OrganizationMembership` y `MembershipRole`, pero sin contraseñas ni sesiones.

## Decisión

Las personas entran con correo y contraseña. Las altas las hace un administrador de la organización; no existe registro abierto.

**Contraseñas.** Se derivan con `scrypt` de la biblioteca estándar de Node, con sal por contraseña y los parámetros de coste guardados dentro del propio hash (`scrypt$N$r$p$sal$clave`). Se descartaron argon2 y bcrypt porque ambos exigen compilación nativa, que en Windows depende de tener toolchain instalada: un requisito de arranque a cambio de una diferencia que aquí no es determinante.

**Sesión.** Un token opaco de 32 bytes, guardado solo como hash en la tabla `sessions`, entregado en una cookie `httpOnly; SameSite=Lax`. No es un JWT.

**Autorización.** `AuthGuard` acepta las dos identidades y deja constancia de cuál entró: una persona por cookie (que además queda en `request.user`) o un servicio por credencial. `SessionGuard` exige persona y protege la gestión de usuarios; `RolesGuard` filtra por rol. Una credencial de servicio no tiene rol, así que no alcanza esas rutas.

**Mismo origen.** El frontend sirve la API bajo su propio origen mediante el proxy de Vite. Entre `localhost:5173` y `127.0.0.1:3000` el navegador ve dos sitios distintos y no enviaría una cookie `SameSite=Lax`.

## Alternativas consideradas

- **JWT firmado en la cookie**: evita consultar la base en cada petición, pero un token firmado sigue siendo válido hasta que caduca. Revocar el acceso a alguien exigiría una lista de revocación —es decir, la consulta que se quería evitar— o aceptar que siga trabajando un rato más. Con datos bancarios eso no compensa; descartada.
- **Token en `localStorage` con cabecera `Authorization`**: no exige proxy ni pensar en `SameSite`, pero cualquier script inyectado en la página puede leer la sesión. `httpOnly` cierra esa vía por completo; descartada.
- **Cookie `SameSite=None; Secure` para permitir orígenes distintos**: obliga a servir con TLS también en desarrollo y reabre la puerta al CSRF; descartada en favor del proxy.
- **Registro abierto**: cómodo para probar, pero cualquiera que alcance la URL entraría y crearía su organización; descartada.
- **Que el administrador fije la contraseña de cada persona**: la contraseña definitiva pasaría por sus manos. Se genera una temporal que se muestra una sola vez y la persona la cambia; el enlace de invitación con caducidad queda como mejora futura.
- **Añadir `passport` y `@nestjs/jwt`**: dos dependencias para un flujo que son dos rutas y un guard. La regla del proyecto pide justificar cada librería que se suma; descartada.

## Consecuencias

- Cerrar sesión, revocar una membresía o desactivar una cuenta surte efecto **en la petición siguiente**, porque la membresía se comprueba cada vez y no se copia en la sesión.
- Cada petición autenticada hace una consulta más. Es el precio de la revocación inmediata y está indexada por `tokenHash`.
- `Statement.uploadedBy` y `AuditEvent.actorUserId` por fin se rellenan: `session.started`, `member.created`, `member.updated`, `member.password_reset` y `statement.processed` quedan atribuidos.
- Cinco intentos fallidos seguidos bloquean la cuenta 15 minutos. Sin eso, un endpoint público permite probar contraseñas sin límite.
- El login responde igual ante un correo inexistente que ante una contraseña equivocada, y verifica contra un hash de descarte cuando el correo no existe para que tampoco el tiempo de respuesta lo delate.
- El modo `memory` de [`ADR-0004`](ADR-0004-modo-sin-persistencia.md) **no tiene inicio de sesión**: sin base de datos no hay dónde guardar personas. Sigue usando la credencial de servicio.
- La credencial de servicio no desaparece: es la vía para integraciones, y por diseño no puede gestionar usuarios.
- El frontend depende del proxy en desarrollo. Desplegar la API en otro dominio exigiría CORS con credenciales y revisar `SameSite`.

## Criterio de revisión

Revisar si una persona necesita pertenecer a varias organizaciones y cambiar entre ellas: hoy se resuelve entrando a la primera membresía activa. Revisar también al añadir el flujo de invitación por enlace, o si aparece un cliente que no sea un navegador y no pueda guardar cookies.
