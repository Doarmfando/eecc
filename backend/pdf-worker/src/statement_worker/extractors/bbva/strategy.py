"""Estrategia BBVA: única capa que une la lectura con el contrato de salida."""

from __future__ import annotations

from pathlib import Path

from statement_worker.domain.errors import UnsupportedDocumentError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.exporters.bbva_workbook import build_bbva_workbook_plan
from statement_worker.services.pdf_sanitizer import sanitized_pdf_path
from statement_worker.services.strategy import StatementOutcome

from .detector import BBVA_EXTRACTOR_ID, BbvaTemplateDetector
from .models import BbvaProcessingResult, BbvaRowType
from .pdfplumber_adapter import read_bbva_pdf
from .rows import read_bbva_rows
from .validation import validate_bbva_rows

BBVA_STRATEGY_ID = BBVA_EXTRACTOR_ID
BBVA_STRATEGY_VERSION = "0.1.0"


class BbvaStatementStrategy:
    extractor_id = BBVA_STRATEGY_ID
    extractor_version = BBVA_STRATEGY_VERSION

    def process(
        self,
        pdf_path: Path,
        *,
        default_year: int | None = None,
        temporary_parent: Path | None = None,
    ) -> StatementOutcome:
        detector = BbvaTemplateDetector()

        with sanitized_pdf_path(pdf_path, temporary_parent=temporary_parent) as readable_path:
            read_result = read_bbva_pdf(readable_path)

        detection = detector.detect(read_result.probe)
        if detection.confidence < detector.minimum_confidence:
            raise UnsupportedDocumentError("The document does not match the BBVA template")

        document = read_bbva_rows(
            read_result.pages,
            first_page_text=read_result.probe.first_page_text,
            default_year=default_year,
        )
        report = validate_bbva_rows(document.rows, warning_codes=document.warning_codes)
        result = BbvaProcessingResult(detection=detection, document=document)
        plan = (
            build_bbva_workbook_plan(result, report)
            if report.status is not ExtractionStatus.FAILED
            else None
        )

        return StatementOutcome(
            detection=detection,
            status=report.status,
            row_count=len(document.rows),
            movement_count=sum(1 for row in document.rows if row.row_type is BbvaRowType.MOVEMENT),
            page_count=len(read_result.pages),
            warning_codes=tuple(code.value for code in report.warning_codes),
            check_codes=tuple((check.code.value, check.status.value) for check in report.checks),
            plan=plan,
        )
