"""Carga y ejecuta el exportador BCP legacy sin depender de rutas fijas."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

REFERENCES_DIRECTORY = "referencias"
LEGACY_BCP_SCRIPT = "formatoBCP (1).py"
LEGACY_REQUIREMENTS = ("pandas", "pdfplumber", "tqdm")


def references_root(start: Path | None = None) -> Path | None:
    """Busca hacia arriba la carpeta `referencias/` que contiene el script legacy."""

    current = (start or Path(__file__)).resolve()
    for candidate in (current, *current.parents):
        references = candidate / REFERENCES_DIRECTORY
        if (references / LEGACY_BCP_SCRIPT).is_file():
            return references
    return None


def missing_requirements() -> tuple[str, ...]:
    return tuple(name for name in LEGACY_REQUIREMENTS if importlib.util.find_spec(name) is None)


def unavailable_reason() -> str | None:
    """Explica por qué la comparación con el legacy no puede ejecutarse."""

    if references_root() is None:
        return f"No se encontró `{LEGACY_BCP_SCRIPT}` en `{REFERENCES_DIRECTORY}/`."
    missing = missing_requirements()
    if missing:
        return f"Faltan dependencias de desarrollo para el legacy: {', '.join(missing)}."
    return None


def load_legacy_bcp_module() -> ModuleType:
    """Importa el script legacy como módulo aislado y sin ejecutar su bloque principal."""

    root = references_root()
    if root is None:  # pragma: no cover - protegido por `unavailable_reason`.
        raise RuntimeError("The legacy BCP script is not available")

    module_name = "eecc_legacy_bcp"
    cached = sys.modules.get(module_name)
    if isinstance(cached, ModuleType):
        return cached

    specification = importlib.util.spec_from_file_location(module_name, root / LEGACY_BCP_SCRIPT)
    if specification is None or specification.loader is None:  # pragma: no cover - defensivo.
        raise RuntimeError("The legacy BCP script could not be loaded")

    module = importlib.util.module_from_spec(specification)
    sys.modules[module_name] = module
    specification.loader.exec_module(module)
    return module


def run_legacy_bcp_export(pdf_path: Path, excel_output: Path) -> None:
    """Ejecuta el exportador legacy tal como está, sin modificarlo."""

    module = load_legacy_bcp_module()
    module.extraer_bcp_pdf_a_excel(pdf_path, excel_output)
