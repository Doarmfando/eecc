"""Estrategia Banco de la Nación: única capa que une la lectura con el contrato de salida."""

from __future__ import annotations

from pathlib import Path

from statement_worker.domain.errors import UnsupportedDocumentError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.exporters.banco_nacion_workbook import build_banco_nacion_workbook_plan
from statement_worker.services.pdf_sanitizer import sanitized_pdf_path
from statement_worker.services.strategy import StatementOutcome

from .detector import BANCO_NACION_EXTRACTOR_ID, BancoNacionTemplateDetector
from .models import BancoNacionProcessingResult, BancoNacionRowType
from .pdfplumber_adapter import read_banco_nacion_pdf
from .rows import read_banco_nacion_rows
from .validation import validate_banco_nacion_rows

BANCO_NACION_STRATEGY_ID = BANCO_NACION_EXTRACTOR_ID
BANCO_NACION_STRATEGY_VERSION = "0.1.0"


class BancoNacionStatementStrategy:
    extractor_id = BANCO_NACION_STRATEGY_ID
    extractor_version = BANCO_NACION_STRATEGY_VERSION

    def process(
        self,
        pdf_path: Path,
        *,
        default_year: int | None = None,
        temporary_parent: Path | None = None,
    ) -> StatementOutcome:
        detector = BancoNacionTemplateDetector()

        with sanitized_pdf_path(pdf_path, temporary_parent=temporary_parent) as readable_path:
            read_result = read_banco_nacion_pdf(readable_path)

        detection = detector.detect(read_result.probe)
        if detection.confidence < detector.minimum_confidence:
            raise UnsupportedDocumentError(
                "The document does not match the Banco de la Nacion template"
            )

        # `default_year` solo se usa si una fecha no trae año y el documento no
        # declara su periodo.
        document = read_banco_nacion_rows(
            read_result.pages,
            first_page_text=read_result.probe.first_page_text,
            default_year=default_year,
        )
        report = validate_banco_nacion_rows(document.rows, warning_codes=document.warning_codes)
        result = BancoNacionProcessingResult(detection=detection, document=document)
        plan = (
            build_banco_nacion_workbook_plan(result, report)
            if report.status is not ExtractionStatus.FAILED
            else None
        )

        return StatementOutcome(
            detection=detection,
            status=report.status,
            row_count=len(document.rows),
            movement_count=sum(
                1 for row in document.rows if row.row_type is BancoNacionRowType.MOVEMENT
            ),
            page_count=len(read_result.pages),
            warning_codes=tuple(code.value for code in report.warning_codes),
            check_codes=tuple((check.code.value, check.status.value) for check in report.checks),
            plan=plan,
        )
