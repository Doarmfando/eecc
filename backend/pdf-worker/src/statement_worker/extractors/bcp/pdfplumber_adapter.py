"""Adaptador de pdfplumber hacia modelos visuales BCP."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

import pdfplumber

from statement_worker.domain.errors import InvalidPdfError
from statement_worker.domain.models import DocumentProbe
from statement_worker.extractors.page_parallelism import (
    PageRange,
    ParallelReadUnavailableError,
    read_pages_in_parallel,
    resolve_worker_count,
)

from .layout import (
    FOOTER_AWARE_ROW_TOLERANCE,
    detect_bcp_table_bounds,
    group_words_by_row,
    words_inside_bounds,
)
from .models import BcpPageReadMetrics, BcpPdfReadResult, BcpVisualRow, PdfWord

_CROP_LEFT = Decimal("25")
_CROP_TOP = Decimal("180")
_CROP_RIGHT = Decimal("575")
_CROP_BOTTOM = Decimal("740")


def _decimal(value: object) -> Decimal:
    return Decimal(str(value))


@contextmanager
def _opened_pdf(pdf_path: Path) -> Iterator[pdfplumber.pdf.PDF]:
    """Traduce cualquier fallo del lector a un error de dominio sanitizable."""

    try:
        pdf = pdfplumber.open(str(pdf_path))
    except Exception as error:  # El lector expone detalles internos del documento.
        raise InvalidPdfError("The document could not be read as a PDF") from error
    try:
        yield pdf
    finally:
        pdf.close()


def probe_bcp_pdf_with_pdfplumber(pdf_path: Path) -> DocumentProbe:
    """Lee solo la primera página para poder decidir antes de recorrer el resto.

    Un estado de cuenta real tiene cientos de páginas: recorrerlas todas para luego
    rechazar el documento desperdicia el tiempo del usuario y del servidor.
    """

    if not pdf_path.is_file():
        raise InvalidPdfError("The PDF source is not a regular file")

    with _opened_pdf(pdf_path) as pdf:
        if not pdf.pages:
            raise InvalidPdfError("The PDF does not contain pages")
        first_page = pdf.pages[0]
        return DocumentProbe(
            first_page_text=first_page.extract_text(x_tolerance=1, y_tolerance=3) or "",
            page_count=len(pdf.pages),
            page_width=_decimal(first_page.width),
            page_height=_decimal(first_page.height),
        )


@dataclass(frozen=True, slots=True)
class _PageReadout:
    """Resultado de una página, en tipos que pueden viajar entre procesos."""

    page: int
    rows: tuple[BcpVisualRow, ...]
    metrics: BcpPageReadMetrics
    text: str
    width: Decimal
    height: Decimal


def _read_single_page(page: pdfplumber.page.Page, page_number: int) -> _PageReadout:
    """Convierte una página en filas visuales. No contiene reglas bancarias."""

    page_width = _decimal(page.width)
    page_height = _decimal(page.height)
    if page_width <= _CROP_LEFT or page_height <= _CROP_TOP:
        raise InvalidPdfError("The PDF page is too small for the BCP layout")

    crop_right = min(_CROP_RIGHT, page_width)
    crop_bottom = min(_CROP_BOTTOM, page_height)
    cropped = page.crop(
        (
            float(_CROP_LEFT),
            float(_CROP_TOP),
            float(crop_right),
            float(crop_bottom),
        )
    )
    extracted_words = cropped.extract_words(
        x_tolerance=1,
        y_tolerance=2,
        keep_blank_chars=False,
    )
    words = tuple(PdfWord.from_mapping(word) for word in extracted_words)
    bounds = detect_bcp_table_bounds(words)
    selected_words = words_inside_bounds(words, bounds)
    visual_rows = group_words_by_row(
        selected_words,
        tolerance_y=FOOTER_AWARE_ROW_TOLERANCE,
    )

    # El texto completo solo hace falta de la primera página; extraerlo de todas
    # duplicaría justo la operación más cara del documento.
    text = page.extract_text(x_tolerance=1, y_tolerance=3) or "" if page_number == 1 else ""

    return _PageReadout(
        page=page_number,
        rows=visual_rows,
        metrics=BcpPageReadMetrics(
            page=page_number,
            word_count=len(words),
            row_count=len(visual_rows),
            table_top=bounds.top,
            table_bottom=bounds.bottom,
            header_detected=bounds.header_detected,
            footer_detected=bounds.footer_detected,
        ),
        text=text,
        width=page_width,
        height=page_height,
    )


def _read_page_range(arguments: PageRange) -> list[_PageReadout]:
    """Lee un tramo de páginas en su propio proceso."""

    path, first, last = arguments
    with _opened_pdf(Path(path)) as pdf:
        return [
            _read_single_page(pdf.pages[number - 1], number) for number in range(first, last + 1)
        ]


def _read_every_page(pdf_path: Path, page_count: int, workers: int) -> list[_PageReadout]:
    """Reparte si compensa y puede; leer aquí mismo siempre es una salida válida."""

    whole_document: PageRange = (str(pdf_path), 1, page_count)
    if workers == 1:
        return _read_page_range(whole_document)
    try:
        collected = read_pages_in_parallel(_read_page_range, pdf_path, page_count, workers)
    except ParallelReadUnavailableError:
        # Repartir es una optimización. Si la máquina no puede, el documento sigue
        # siendo legible y el resultado es el mismo, solo que más despacio.
        return _read_page_range(whole_document)
    return sorted(collected, key=lambda readout: readout.page)


def read_bcp_pdf_with_pdfplumber(
    pdf_path: Path,
    *,
    max_workers: int | None = None,
) -> BcpPdfReadResult:
    """Lee el PDF y entrega filas visuales, no reglas bancarias.

    Casi todo el tiempo de un estado de cuenta real se va en convertir los caracteres
    de sus páginas, y las páginas son independientes entre sí. Se reparten entre
    procesos y el resultado se reordena, de modo que es idéntico al secuencial.
    """

    if not pdf_path.is_file():
        raise InvalidPdfError("The PDF source is not a regular file")

    with _opened_pdf(pdf_path) as pdf:
        page_count = len(pdf.pages)
    if not page_count:
        raise InvalidPdfError("The PDF does not contain pages")

    readouts = _read_every_page(pdf_path, page_count, resolve_worker_count(page_count, max_workers))
    first = readouts[0]
    return BcpPdfReadResult(
        probe=DocumentProbe(
            first_page_text=first.text,
            page_count=len(readouts),
            page_width=first.width,
            page_height=first.height,
        ),
        page_rows=tuple((readout.page, row) for readout in readouts for row in readout.rows),
        page_metrics=tuple(readout.metrics for readout in readouts),
    )
