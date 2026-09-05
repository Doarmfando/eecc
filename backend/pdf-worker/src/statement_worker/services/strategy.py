"""Puerto que une extracción y contrato de salida sin exponer reglas bancarias."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable

from statement_worker.domain.models import Detection, ExtractionStatus
from statement_worker.exporters.workbook import WorkbookPlan


@dataclass(frozen=True, slots=True)
class StatementOutcome:
    """Resultado seguro de una estrategia: códigos, conteos y plan de salida.

    No contiene descripciones, importes ni fragmentos del documento.
    """

    detection: Detection
    status: ExtractionStatus
    row_count: int
    movement_count: int
    page_count: int
    warning_codes: tuple[str, ...]
    check_codes: tuple[tuple[str, str], ...]
    plan: WorkbookPlan | None

    def __post_init__(self) -> None:
        if min(self.row_count, self.movement_count, self.page_count) < 0:
            raise ValueError("outcome counters cannot be negative")
        if self.movement_count > self.row_count:
            raise ValueError("movements cannot exceed extracted rows")
        if self.plan is not None and self.status is ExtractionStatus.FAILED:
            raise ValueError("a failed extraction cannot carry an export plan")


@runtime_checkable
class StatementStrategy(Protocol):
    """Convierte un PDF ya autorizado en un resultado exportable."""

    extractor_id: str
    # Cambiar reglas de extracción cambia el resultado: la versión forma parte
    # de la identidad del trabajo para no servir una lectura anterior.
    extractor_version: str

    def process(
        self,
        pdf_path: Path,
        *,
        default_year: int | None = None,
        temporary_parent: Path | None = None,
    ) -> StatementOutcome:
        """Ejecuta detección, extracción, reconciliación y mapeo de salida."""
        ...
