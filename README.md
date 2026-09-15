# Conversor de estados de cuenta bancarios

Convierte estados de cuenta bancarios en PDF a movimientos estructurados y archivos Excel/CSV, validando que lo extraído cuadre con lo que declara el documento.

**No es un conversor genérico de PDF.** Solo procesa estados de cuenta que superen la detección de una plantilla compatible; un archivo no reconocido se rechaza en vez de intentar "rescatar" filas.

## Empezar

```powershell
.\instalar.ps1     # dependencias y configuración local
.\ejecutar.ps1     # levanta los tres servicios
```

El segundo imprime la URL y la credencial. Detalle completo, modos y problemas comunes en **[`EJECUTAR.md`](EJECUTAR.md)**.

## Qué hace

```
PDF  ──►  detección de plantilla  ──►  extracción  ──►  validación  ──►  XLSX + CSV
       (BCP, Interbank, Banco de la                   (invariantes,
        Nación o genérica)                             reconciliación)
```

Una extracción no se da por buena solo porque produjo filas: tiene que pasar invariantes (totales por página, balance del documento, campos de movimiento) y las advertencias viajan en la respuesta.

## Arquitectura

Tres piezas con responsabilidades separadas:

| Pieza | Tecnología | De qué es dueña |
| --- | --- | --- |
| [`backend/pdf-worker`](backend/pdf-worker/) | Python, FastAPI, Celery | Todo lo que sabe de PDF, bancos y Excel. No conoce PostgreSQL ni S3 |
| [`backend/api-backend`](backend/api-backend/) | NestJS, Prisma | Autoriza, orquesta y persiste. **Nunca abre un PDF** |
| [`frontend`](frontend/) | React, Vite, TypeScript | Carga, seguimiento y descarga |

El frontend habla solo con la API; la API es lo único que habla con el worker.

## Acceso

Cada persona entra con **su propio usuario y contraseña**. No hay registro abierto: las cuentas las crea un administrador, desde la sección *Usuarios*.

| Rol | Qué puede hacer |
| --- | --- |
| `ADMIN` (Administrador) | Crea cuentas —también de otros administradores—, cambia nombre, correo y contraseña, desactiva y elimina usuarios, y ve cuántos documentos tiene cada uno. Además procesa documentos |
| `MEMBER` (Usuario) | Procesa documentos y consulta el historial |

Un administrador **nunca se elimina ni pasa a usuario**; sí se puede desactivar. Eliminar un usuario borra también sus documentos. Detalles en [`ADR-0008`](docs/decisiones/ADR-0008-administrador-y-usuario.md).

La sesión vive en una cookie `httpOnly`, así que ningún script de la página puede leerla. El token es opaco y tiene fila propia en la base: revocar el acceso o cerrar sesión surte efecto en la petición siguiente, sin esperar a que caduque nada. Detalles en [`ADR-0005`](docs/decisiones/ADR-0005-identidad-de-usuarios-y-sesiones.md).

## Persistencia

**PostgreSQL es obligatorio.** Ahí viven las personas, sus sesiones, el estado de los trabajos y la auditoría; los archivos van a disco tras el adaptador de almacenamiento.

Existió un modo sin base de datos que no guardaba nada. Se retiró al añadir identidad de usuarios, porque sin base no hay dónde guardar personas y quedaba sin inicio de sesión: [`ADR-0006`](docs/decisiones/ADR-0006-postgresql-como-unica-persistencia.md) explica por qué y qué queda pendiente a cambio.

El esquema aplica minimización: **no existe tabla de movimientos bancarios**. Se guardan identificadores, estados, conteos y códigos, nunca los importes ni las descripciones extraídas ([`ADR-0002`](docs/decisiones/ADR-0002-postgresql-prisma-y-minimizacion-financiera.md)).

Y los archivos no se acumulan: **cada persona conserva sus 3 documentos más recientes** y los anteriores se borran enteros —PDF de origen, resultados y fila—. El número se ajusta con `RETAINED_STATEMENTS_PER_USER`. Ver [`ADR-0007`](docs/decisiones/ADR-0007-cupo-de-documentos-por-persona.md).

## Estructura

```text
.
├── instalar.ps1           # Instala dependencias y prepara los .env
├── ejecutar.ps1           # Levanta, detiene y consulta el estado de los servicios
├── EJECUTAR.md            # Guía de ejecución
├── AGENTS.md              # Reglas de trabajo (normativas, léelas antes de tocar código)
├── CLAUDE.md              # Puerta de entrada para agentes de IA
├── backend/
│   ├── api-backend/       # API pública y orquestador NestJS
│   └── pdf-worker/        # Extracción Python, FastAPI y tareas Celery
├── frontend/              # React, Vite y TypeScript
├── referencias/           # Prototipo legacy y documentos de muestra
└── docs/                  # Contexto, arquitectura, decisiones y bitácora
```

## El prototipo legacy

[`referencias/`](referencias/) guarda los cuatro scripts originales en Python junto a los documentos de muestra. El más completo es `convertir_movimientos_pdf_a_excel (1).py`, que combina extracción BCP por coordenadas con un extractor genérico.

**No se borran todavía.** `formatoBCP (1).py` se ejecuta tal cual en las pruebas de caracterización para comprobar que la implementación nueva mantiene sus resultados; por eso los `.py` de esa carpeta sí se versionan, aunque sus PDF, XLSX y CSV no.

Inventario de conversiones y contratos por preservar: [`docs/contexto/conversiones-legacy.md`](docs/contexto/conversiones-legacy.md).

## Si eres un agente de IA

Lee en este orden:

1. **[`AGENTS.md`](AGENTS.md)** — reglas no negociables. Manejo de datos financieros, límites entre capas, uso de `Decimal`, qué conservar. Es normativo, no orientativo.
2. **[`docs/README.md`](docs/README.md)** — índice de toda la documentación.
3. **[`docs/bitacora/README.md`](docs/bitacora/README.md)** — qué se hizo últimamente y por qué.
4. **[`docs/roadmap/README.md`](docs/roadmap/README.md)** — qué toca hacer después.

Antes de terminar una tarea: ejecuta las comprobaciones (`npm run check`, `scripts\check.ps1`), actualiza la bitácora si el cambio fue material, y añade un ADR en `docs/decisiones/` si cambiaste una decisión duradera.

## Datos financieros

Los PDF, Excel y CSV pueden contener información real. No se versionan, no se envían a servicios externos y no aparecen en los registros. Las pruebas usan muestras sintéticas generadas en `tests/support/`.

Ninguna respuesta de la API incluye movimientos, importes, rutas locales ni trazas: solo identificadores, estados, conteos y códigos.



En interfaz evitar:

- Interfaces recargadas.
- Emojis en botones o títulos.
- Iconos desproporcionados.
- Tablas angostas cuando tienen muchas columnas.