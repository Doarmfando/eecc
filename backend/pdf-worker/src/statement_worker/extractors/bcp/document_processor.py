"""Procesamiento BCP desde un archivo PDF saneado."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from statement_worker.domain.errors import UnsupportedDocumentError
from statement_worker.domain.models import Detection
from statement_worker.services.pdf_sanitizer import sanitized_pdf_path

from .detector import BcpTemplateDetector
from .header import read_bcp_header
from .metadata import (
    extract_bcp_currency,
    extract_bcp_statement_period,
    extract_bcp_statement_year,
)
from .models import BcpPageReadMetrics, BcpParsedRow, BcpStatementHeader
from .pdfplumber_adapter import probe_bcp_pdf_with_pdfplumber, read_bcp_pdf_with_pdfplumber
from .pipeline import process_bcp_visual_rows
from .validation import BcpValidationReport, flag_incomplete_pages


@dataclass(frozen=True, slots=True)
class BcpPdfProcessingResult:
    detection: Detection
    rows: tuple[BcpParsedRow, ...]
    validation: BcpValidationReport
    page_metrics: tuple[BcpPageReadMetrics, ...]
    currency: str | None = None
    header: BcpStatementHeader = field(default_factory=BcpStatementHeader)


def process_bcp_pdf(
    pdf_path: Path,
    *,
    default_year: int | None = None,
    temporary_parent: Path | None = None,
) -> BcpPdfProcessingResult:
    detector = BcpTemplateDetector()

    with sanitized_pdf_path(pdf_path, temporary_parent=temporary_parent) as readable_path:
        # Primero la primera página: un documento incompatible se rechaza sin recorrer
        # las cientos de páginas que puede tener un estado de cuenta real.
        probe = probe_bcp_pdf_with_pdfplumber(readable_path)
        detection = detector.detect(probe)
        if detection.confidence < detector.minimum_confidence:
            raise UnsupportedDocumentError("The document does not match the supported BCP template")

        read_result = read_bcp_pdf_with_pdfplumber(readable_path)

    resolved_year = default_year or extract_bcp_statement_year(probe.first_page_text)
    core_result = process_bcp_visual_rows(
        read_result.page_rows,
        default_year=resolved_year,
        period=extract_bcp_statement_period(probe.first_page_text),
    )
    return BcpPdfProcessingResult(
        detection=detection,
        rows=core_result.rows,
        validation=flag_incomplete_pages(core_result.validation, read_result.page_metrics),
        page_metrics=read_result.page_metrics,
        currency=extract_bcp_currency(probe.first_page_text),
        header=read_bcp_header(read_result.header_words),
    )
