# ADR-0006: PostgreSQL como única persistencia

- Estado: Aceptada
- Fecha: 2026-09-08
- Reemplaza a: [`ADR-0004`](ADR-0004-modo-sin-persistencia.md)

## Contexto

[`ADR-0004`](ADR-0004-modo-sin-persistencia.md) añadió `PERSISTENCE_MODE=memory` para poder usar el conversor sin retener información financiera: sin PostgreSQL, sin escribir el PDF de origen y pidiendo al worker que borrara su copia de los resultados.

Poco después, [`ADR-0005`](ADR-0005-identidad-de-usuarios-y-sesiones.md) introdujo identidad de personas: cada quien entra con su cuenta, con roles y auditoría atribuida. Eso dejó al modo memoria en una posición incoherente: **sin base de datos no hay dónde guardar personas**, así que ese modo se quedó con una credencial compartida y sin inicio de sesión. Los dos modos ya no ofrecían el mismo producto, solo el mismo contrato HTTP.

Mantener ambos costaba más de lo que rendía:

- un módulo entero (`modules/ephemeral`) reimplementando en memoria lo que ya hacía Prisma;
- una capa de puertos con fábricas por token, que existía solo para elegir implementación al arrancar;
- ramas condicionales en `PrismaService`, `ApiKeyGuard` y la configuración;
- cinco variables de entorno y una suite e2e propia;
- y una fuente permanente de sorpresas: el `PERSISTENCE_MODE` del `.env` de cada máquina llegó a decidir si las pruebas pasaban.

## Decisión

Retirar el modo memoria. La aplicación usa PostgreSQL siempre.

Con ello se elimina `PERSISTENCE_MODE` y las variables `EPHEMERAL_*`, el módulo `modules/ephemeral`, el helper `common/persistence`, los puertos de `modules/statements/statements.port.ts` —los controladores vuelven a depender de los servicios concretos— y el método `discardJob` del cliente del worker.

Los scripts `instalar.ps1` y `ejecutar.ps1` pierden su parámetro `-Modo`. El instalador levanta PostgreSQL, aplica migraciones y siembra la primera cuenta; el lanzador se niega a arrancar si la base no responde, en lugar de dejar que la API muera en la primera consulta.

La credencial de servicio (`x-api-key`) **se conserva**: sigue viviendo en la tabla `api_keys` y es la vía para integraciones. Lo que desaparece es la credencial sintética que existía solo en memoria.

## Alternativas consideradas

- **Mantener los dos modos**: conserva la opción de trabajar sin retener nada, pero obliga a implementar cada funcionalidad nueva dos veces. La identidad de usuarios ya no se implementó en memoria, así que el modo estaba quedándose atrás de todos modos; descartada.
- **Dejar el modo memoria solo para pruebas**: no aportaba nada sobre los dobles que ya usan las suites, y seguía costando mantenimiento; descartada.
- **Sustituirlo por SQLite en fichero temporal**: mantendría el ciclo completo sin PostgreSQL, pero introduce un segundo dialecto que Prisma trata distinto (tipos, `Decimal`, migraciones) y no evita escribir en disco, que era el motivo original; descartada.

## Consecuencias

- Una dependencia dura: **sin PostgreSQL no hay aplicación**. A cambio, hay un solo camino que mantener y probar.
- Desaparece la opción de procesar documentos sin retener nada. La minimización sigue viva en el esquema —no existe tabla de movimientos, según [`ADR-0002`](ADR-0002-postgresql-prisma-y-minimizacion-financiera.md)— pero el PDF de origen y los resultados vuelven a conservarse.
- Queda **más urgente** implementar la retención real: `Organization.retentionDays`, `Statement.retainUntil` y `Artifact.retainUntil` existen en el esquema y ningún código los aplica todavía. Era la mitad del motivo por el que ADR-0004 tenía sentido.
- El worker conserva `DELETE /internal/statements/{job_id}`, que se añadió para el modo memoria. Ya nadie lo llama desde la API, pero es una operación legítima de su propio contrato y la necesitará la limpieza por retención; se mantiene con sus pruebas.
- La configuración se reduce: `DATABASE_URL` y `FINGERPRINT_SECRET` vuelven a ser obligatorios sin condiciones, que es más fácil de explicar que una validación que depende de otra variable.
- Las pruebas dejan de depender del `.env` de cada máquina.

## Criterio de revisión

Revisar si vuelve a aparecer la necesidad de procesar documentos sin retenerlos. Si ocurre, la respuesta correcta probablemente no sea un segundo modo de persistencia, sino implementar la retención con caducidad agresiva sobre el único camino que ahora existe.
