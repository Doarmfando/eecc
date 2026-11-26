# Impacto de la migración a ATLAS Personal

El 26 de noviembre de 2026 se consultaron en modo de solo lectura los conteos de `eecc` en Railway.
El informe usa membresías como unidad, ya que una cuenta puede pertenecer a más de una organización.

| Plan | Membresías activas | Afectación |
| --- | ---: | --- |
| Básica | 2 | Candidatas a Personal. Una tiene un tope mensual acordado que supera las 50 páginas de Personal. |
| Especial | 0 | El script debe cubrir este plan, aunque el inventario actual no tiene membresías asociadas. |
| Atlas | 4 | Dos pertenecen a administradores o superadministradores. Las otras dos requieren un tratamiento comercial antes del cambio. |
| Gratuito | 1 | Conserva su membresía y el estado de la prueba única. |

Al consultar, ninguna de las dos membresías candidatas a Personal tenía consumo registrado en los
últimos 30 días. No hubo reservas pendientes. Ambos conteos pueden cambiar antes de la migración.
Los consumos de documentos eliminados antes de que existiera el registro comercial pueden ser
irrecuperables. Se conserva la evidencia disponible en `page_consumption_entries`.

## Propuesta para el corte

1. Pasar Básica y Especial a Personal con su vigencia existente. Conservar el consumo registrado
   aplicable al periodo y comprobar el saldo individual antes y después del cambio sin incluirlo en
   el reporte. Habilitar Personal como opción comercial en el mismo corte.
2. Para el tope acordado que supera 50, conservar la capacidad contratada hasta el vencimiento
   vigente y usar la cuota de Personal en la siguiente renovación. Calcular cualquier lote de
   transición a partir de las páginas adicionales aún disponibles, después de descontar lo que
   Personal ya cubre y el consumo registrado. La cifra de `monthly_page_quota_override` representa
   el tope total anterior, por lo que otorgarla íntegra además de Personal duplicaría páginas.
3. Identificar las membresías administrativas con un plan interno sin tope. Para las dos cuentas
   Atlas de otros roles, conservar las condiciones vigentes hasta la renovación y acordar el
   producto siguiente según el contrato. El cambio de membresía no asigna roles ni permisos.
4. Recalcular el inventario en el corte. Aplicar el cambio en una transacción con protección contra
   nuevas reservas para las cuentas afectadas y una referencia auditable que impida otorgar lotes
   dos veces. Ensayar con casos sintéticos de cuenta vigente, vencida, con consumo, con tope
   acordado y con pago o conversión en curso.

## Implementación local

El comando `commercial:migrate-personal` corre en simulación por defecto y entrega solo conteos.
Requiere que la base tenga las migraciones del catálogo y de lotes. El corte se solicita con
`--apply` y se ejecuta en una transacción. El ensayo local usa un esquema PostgreSQL exclusivo con
datos sintéticos.

En ese corte, Básica y Especial pasan a Personal cuando se pueden conservar sus condiciones. El
periodo mantiene su ancla y vigencia. Si ya hay un lote del periodo, se actualiza ese mismo lote y
se conservan sus asignaciones. Si falta, se crea un único lote y se arrastra el consumo registrado
sin reserva desde el inicio del periodo o desde hace 30 días, lo que abarque más. Las cuentas
vencidas no reciben un lote vigente. Cada membresía migrada deja un evento de auditoría.

El plan Administración (`ADMINISTRACION`) conserva los límites y vistas internos de Atlas. Las
membresías de los roles administrativos pasan a ese plan. Gratuito queda como predeterminado
comercial, Personal se activa y se retiran del catálogo de altas Básica, Especial y Atlas. Las
cuentas existentes que quedan en un plan retirado conservan su plan y sus condiciones. El corte
se revierte completo si hay una reserva pendiente para una membresía que cambiaría a Personal.

La herramienta deja pendientes los ajustes de cuota pactados y los Atlas de otros roles. Esas
cuentas necesitan una regla de transición confirmada por el responsable del producto. La
ejecución en producción requiere autorización aparte. Antes del corte, vuelve a simular, revisa
los conteos y coordina una ventana sin altas ni ediciones de membresías.
