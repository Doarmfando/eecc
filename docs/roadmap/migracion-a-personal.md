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

La regla de transición para el tope acordado y las dos membresías Atlas comerciales necesita
confirmación. La ejecución en producción requiere autorización aparte. Hasta entonces, `PERSONAL`
permanece retirado en el catálogo de la rama comercial.
