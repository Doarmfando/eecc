"""Puertos que deben implementar los extractores concretos."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from .models import Detection, DocumentProbe, ExtractionResult


class StatementExtractor(Protocol):
    extractor_id: str
    version: str

    def detect(self, probe: DocumentProbe) -> Detection:
        """Evalúa señales sin persistir ni revelar el texto del documento."""
        ...

    def extract(self, pdf_path: Path) -> ExtractionResult:
        """Extrae desde una ruta temporal controlada."""
        ...
