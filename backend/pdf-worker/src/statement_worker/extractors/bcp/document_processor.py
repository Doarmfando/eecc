"""Procesamiento BCP desde un archivo PDF saneado."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from statement_worker.domain.errors import UnsupportedDocumentError
from statement_worker.domain.models import Detection
from statement_worker.services.pdf_sanitizer import sanitized_pdf_path

from .detector import BcpTemplateDetector
from .metadata import extract_bcp_statement_year
from .models import BcpPageReadMetrics, BcpParsedRow
from .pdfplumber_adapter import probe_bcp_pdf_with_pdfplumber, read_bcp_pdf_with_pdfplumber
from .pipeline import process_bcp_visual_rows
from .validation import BcpValidationReport


@dataclass(frozen=True, slots=True)
class BcpPdfProcessingResult:
    detection: Detection
    rows: tuple[BcpParsedRow, ...]
    validation: BcpValidationReport
    page_metrics: tuple[BcpPageReadMetrics, ...]


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
    )
    return BcpPdfProcessingResult(
        detection=detection,
        rows=core_result.rows,
        validation=core_result.validation,
        page_metrics=read_result.page_metrics,
    )
