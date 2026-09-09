# Contexto para agentes de IA

Este archivo lo cargan automáticamente los agentes que trabajan en este repositorio. Es un enrutador, no la fuente de las reglas.

## Lee esto antes de tocar código

**[`AGENTS.md`](AGENTS.md) es la fuente normativa.** Léela completa: contiene reglas no negociables sobre datos financieros, límites entre capas y criterios de finalización. No es orientativa.

Después:

- [`README.md`](README.md) — qué es el proyecto y cómo está montado.
- [`EJECUTAR.md`](EJECUTAR.md) — cómo levantarlo (`.\instalar.ps1` y `.\ejecutar.ps1`).
- [`docs/README.md`](docs/README.md) — índice de toda la documentación.
- [`docs/bitacora/README.md`](docs/bitacora/README.md) — qué se hizo últimamente y por qué.

## Lo mínimo que hay que saber

- El proyecto convierte **estados de cuenta bancarios** en PDF a XLSX/CSV validados. No es un conversor genérico y no debe evolucionar hacia uno.
- Tres piezas: `backend/pdf-worker` (Python, todo lo que sabe de PDF), `backend/api-backend` (NestJS, autoriza y orquesta, **nunca abre un PDF**) y `frontend` (React).
- **PostgreSQL es obligatorio**: es la única persistencia. El modo sin base de datos se retiró; ver [`ADR-0006`](docs/decisiones/ADR-0006-postgresql-como-unica-persistencia.md).
- Cada persona conserva solo sus 3 documentos más recientes (`RETAINED_STATEMENTS_PER_USER`); los anteriores se borran enteros al subir uno nuevo. Ver [`ADR-0007`](docs/decisiones/ADR-0007-cupo-de-documentos-por-persona.md).
- Las personas entran con usuario y contraseña, y la sesión es una cookie `httpOnly` con token opaco en la tabla `sessions`. Las altas las hace un administrador; no hay registro abierto. Ver [`ADR-0005`](docs/decisiones/ADR-0005-identidad-de-usuarios-y-sesiones.md).
- Nunca guardes una contraseña en claro ni la registres: se derivan con `scrypt` en `modules/auth/password-hash.ts`.
- Los importes se manejan con `Decimal`, nunca con coma flotante.
- Los documentos de `referencias/` pueden contener **información financiera real**. No los abras salvo que la tarea lo exija, y nunca los pongas en registros ni los envíes a servicios externos. Para pruebas hay generadores sintéticos en `backend/pdf-worker/tests/support/`.

## Antes de dar una tarea por terminada

```powershell
cd backend\api-backend;  npm run check        # tipos, ESLint, Prettier, Prisma y pruebas
cd backend\pdf-worker;   .\scripts\check.ps1  # pytest con cobertura, Ruff y mypy
```

Y si el cambio fue material, actualiza [`docs/bitacora/README.md`](docs/bitacora/README.md); si cambiaste una decisión duradera, añade un ADR en [`docs/decisiones/`](docs/decisiones/).
