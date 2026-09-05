# Reglas específicas del PDF worker

Estas reglas complementan el `AGENTS.md` de la raíz.

## Límites

- `domain`, `parsing` y la lógica de `extractors` no importan FastAPI, Celery, Redis, S3, `pdfplumber` ni `openpyxl` salvo en adaptadores explícitos.
- Ningún test unitario abre archivos bancarios reales.
- No copiar el script legacy completo. Migrar una conducta por vez y protegerla con una prueba sintética.
- Mantener importes como `Decimal`. Las descripciones y cuentas son texto.
- Los objetos de diagnóstico contienen códigos y métricas, nunca fragmentos del documento.
- Una estrategia nueva necesita detector, versión, umbral, pruebas positivas, pruebas negativas e invariantes.

## Dependencias permitidas por capa

- `domain`: biblioteca estándar.
- `parsing`: biblioteca estándar y `domain`.
- `extractors`: `domain`, `parsing` y adaptadores PDF internos.
- `services`: coordina interfaces; no contiene reglas específicas de un banco.
- `config`: configuración tipada del entorno; el núcleo no la importa.
- `api` y `tasks`: adaptadores delgados que resuelven la estrategia y llaman servicios.

## Verificación mínima

Ejecuta `scripts/check.ps1`: pruebas con cobertura, lint, formato y tipos deben pasar. Si se modifica parsing, añade casos válidos, inválidos y ambiguos. Si se modifica saneamiento, verifica que el archivo fuente permanezca intacto y el temporal se elimine.
