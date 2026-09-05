"""Estrategia de respaldo: sirve para bancos sin extractor especializado."""

from __future__ import annotations

from pathlib import Path

from statement_worker.domain.errors import UnsupportedDocumentError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.exporters.generic_workbook import build_generic_workbook_plan
from statement_worker.services.pdf_sanitizer import sanitized_pdf_path
from statement_worker.services.strategy import StatementOutcome

from .detector import GenericStatementDetector
from .document import read_document
from .inference import select_movement_rows
from .pdfplumber_adapter import read_generic_tables
from .validation import GenericValidationReport, validate_generic_rows

GENERIC_STRATEGY_ID = "generic-table-v1"
GENERIC_STRATEGY_VERSION = "0.2.0"


class GenericStatementStrategy:
    """Lee la tabla por el nombre de sus columnas, nunca por posición fija.

    No sustituye a un extractor especializado: solo declara el resultado
    reconciliado cuando la columna de saldo avanza de forma consistente. En
    cualquier otro caso entrega los movimientos marcados para revisión.
    """

    extractor_id = GENERIC_STRATEGY_ID
    extractor_version = GENERIC_STRATEGY_VERSION

    def process(
        self,
        pdf_path: Path,
        *,
        default_year: int | None = None,
        temporary_parent: Path | None = None,
    ) -> StatementOutcome:
        detector = GenericStatementDetector()

        with sanitized_pdf_path(pdf_path, temporary_parent=temporary_parent) as readable_path:
            read_result = read_generic_tables(readable_path)

        # La rejilla por posición da columnas idénticas en todas las páginas; las
        # tablas del lector son el respaldo cuando no se pudo construir.
        tables = read_result.grids or tuple(
            (page.page, table) for page in read_result.pages for table in page.tables
        )
        movement_rows = sum(len(select_movement_rows(table)) for _page, table in tables)

        detection = detector.detect(read_result.probe, movement_rows=movement_rows)
        if detection.confidence < detector.minimum_confidence:
            raise UnsupportedDocumentError("The document does not look like a bank statement")
        document = read_document(tables, default_year=default_year)

        ordered = document.rows
        report = validate_generic_rows(
            ordered,
            warning_codes=tuple(code.value for code in document.warning_codes),
        )
        plan = (
            build_generic_workbook_plan(detection, ordered, report)
            if report.status is not ExtractionStatus.FAILED
            else None
        )

        return StatementOutcome(
            detection=detection,
            status=report.status,
            row_count=len(ordered),
            movement_count=len(ordered),
            page_count=len(read_result.pages),
            warning_codes=report.warning_codes,
            check_codes=tuple((check.code.value, check.status.value) for check in report.checks),
            plan=plan,
        )


def summarise(report: GenericValidationReport) -> tuple[str, int]:
    """Resumen seguro para diagnóstico: estado y transiciones verificadas."""

    return report.status.value, report.verified_transitions
