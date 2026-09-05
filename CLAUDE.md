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
- La API tiene dos modos de persistencia, elegidos con `PERSISTENCE_MODE`. En `memory` no escribe nada en ningún disco; en `database` usa PostgreSQL. Ver [`ADR-0004`](docs/decisiones/ADR-0004-modo-sin-persistencia.md).
- Los importes se manejan con `Decimal`, nunca con coma flotante.
- Los documentos de `referencias/` pueden contener **información financiera real**. No los abras salvo que la tarea lo exija, y nunca los pongas en registros ni los envíes a servicios externos. Para pruebas hay generadores sintéticos en `backend/pdf-worker/tests/support/`.

## Antes de dar una tarea por terminada

```powershell
cd backend\api-backend;  npm run check        # tipos, ESLint, Prettier, Prisma y pruebas
cd backend\pdf-worker;   .\scripts\check.ps1  # pytest con cobertura, Ruff y mypy
```

Y si el cambio fue material, actualiza [`docs/bitacora/README.md`](docs/bitacora/README.md); si cambiaste una decisión duradera, añade un ADR en [`docs/decisiones/`](docs/decisiones/).
