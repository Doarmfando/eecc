# ADR-0009: Cada persona ve solo sus documentos

- Estado: Aceptada
- Fecha: 2026-09-14

## Contexto

`GET /v1/jobs` devolvía el historial de **toda la organización**, y detalle y descarga solo comprobaban la organización. Era deliberado: el aislamiento se pensó entre organizaciones, y `uploadedByMe` se añadió para que el aviso del cupo de [`ADR-0007`](ADR-0007-cupo-de-documentos-por-persona.md) no contara documentos ajenos.

En uso real resultó un defecto: una cuenta de usuario recién creada, con un solo PDF subido, veía en *Historial* los documentos de otras personas junto al suyo, con sus resultados descargables. Son estados de cuenta: que cualquiera de la organización pueda abrir los de otro no es aceptable. Además chocaba con el cupo, que ya era por persona: cada uno veía hasta 3 documentos por cada compañero.

Había una segunda fuga menos visible. La reutilización por idempotencia tenía alcance de organización: si alguien subía un PDF que otra persona ya había procesado, recibía el trabajo de esa otra persona.

## Decisión

**Cada persona ve solo lo que subió, sea usuario o administrador.** El filtro es `statement.uploadedById` igual a quien consulta, y se aplica en el servidor a las tres lecturas:

- `GET /v1/jobs` (historial);
- `GET /v1/jobs/{jobId}` (detalle);
- `GET /v1/jobs/{jobId}/artifacts/{artifactId}/content` (descarga).

Un trabajo ajeno responde `404`, igual que uno inexistente: conocer su identificador no basta para verlo, ni para saber que existe.

**Una credencial de servicio** (`userId` nulo) ve lo subido por credenciales de servicio. Es el mismo grupo al que ya aplica el cupo.

**La clave de idempotencia se reparte por dueño.** Se guarda `sha256(dueño + clave)`, donde la clave es la de la cabecera `Idempotency-Key` o, sin ella, la huella del contenido más la versión del perfil. Así, el mismo PDF subido por dos personas produce dos trabajos, y la misma persona que repite un PDF sigue recibiendo el suyo. Se usa un resumen y no un prefijo porque la clave del cliente ya puede ocupar los 128 caracteres de la columna.

`uploadedByMe` se conserva en el contrato. Ahora siempre vale `true` para una sesión, pero retirarlo rompería a clientes que ya lo leen.

## Alternativas consideradas

- **Usuario ve lo suyo; administrador ve todo**: el administrador gestiona cuentas, no revisa documentos ajenos, y ya ve cuántos conserva cada cuenta en *Usuarios*. Darle acceso al contenido amplía quién puede leer información financiera sin que nadie lo haya pedido. Descartada.
- **Filtrar solo el historial**: arregla lo visible, pero detalle y descarga seguirían sirviendo documentos ajenos a quien tenga el identificador. Descartada.
- **Conservar la reutilización entre personas y dar acceso al trabajo reutilizado**: obligaría a una tabla de accesos compartidos solo para ahorrar una llamada al worker. Descartada.

## Consecuencias

- Tras desplegar, cada persona deja de ver documentos ajenos sin migrar datos.
- Las claves de idempotencia guardadas antes no coinciden con las nuevas. La primera vez que alguien repita un PDF que ya tenía, se procesa de nuevo y ocupa cupo; a partir de ahí se reutiliza con normalidad.
- Un documento cuyo autor se eliminó ya no tiene dueño visible. No debería existir: eliminar una cuenta borra sus documentos ([`ADR-0008`](ADR-0008-administrador-y-usuario.md)).

## Criterio de revisión

Revisar si aparece la necesidad de que alguien consulte documentos de otras personas (supervisión, auditoría). Debería ser un permiso explícito y registrado, no un efecto del rol de administrador.
