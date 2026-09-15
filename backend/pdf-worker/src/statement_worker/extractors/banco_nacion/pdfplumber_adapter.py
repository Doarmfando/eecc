"""Adaptador de pdfplumber hacia filas visuales. No contiene reglas bancarias."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
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

from .models import BancoNacionPageReadout, BancoNacionPdfReadResult, BancoNacionWord

# Palabras cuya parte superior difiere en menos de esto forman la misma fila. Dos
# líneas de texto a 8 puntos quedan separadas unos 10: 3 no mezcla dos filas y
# absorbe que importes y descripción no compartan línea base exacta.
ROW_TOLERANCE = Decimal("3")


def _decimal(value: object) -> Decimal:
    return Decimal(str(value))


@contextmanager
def _opened_pdf(pdf_path: Path) -> Iterator[pdfplumber.pdf.PDF]:
    try:
        pdf = pdfplumber.open(str(pdf_path))
    except Exception as error:  # El lector expone detalles internos del documento.
        raise InvalidPdfError("The document could not be read as a PDF") from error
    try:
        yield pdf
    finally:
        pdf.close()


def group_words_into_rows(
    words: tuple[BancoNacionWord, ...],
    *,
    tolerance: Decimal = ROW_TOLERANCE,
) -> tuple[tuple[BancoNacionWord, ...], ...]:
    ordered = sorted(words, key=lambda word: (word.top, word.x0))
    rows: list[list[BancoNacionWord]] = []
    anchor: Decimal | None = None
    for word in ordered:
        if anchor is None or word.top - anchor > tolerance:
            rows.append([])
            anchor = word.top
        rows[-1].append(word)
    return tuple(tuple(sorted(row, key=lambda word: word.x0)) for row in rows)


def _read_page(page: pdfplumber.page.Page, page_number: int) -> tuple[BancoNacionPageReadout, str]:
    extracted = page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False)
    words = tuple(
        BancoNacionWord(
            text=str(word["text"]),
            x0=_decimal(word["x0"]),
            x1=_decimal(word["x1"]),
            top=_decimal(word["top"]),
        )
        for word in extracted
    )
    # El texto completo solo hace falta de la primera página: detección, periodo y moneda.
    text = (page.extract_text(x_tolerance=1.5, y_tolerance=3) or "") if page_number == 1 else ""
    return (
        BancoNacionPageReadout(
            page=page_number,
            rows=group_words_into_rows(words),
            word_count=len(words),
        ),
        text,
    )


def _read_page_range(arguments: PageRange) -> list[tuple[BancoNacionPageReadout, str]]:
    path, first, last = arguments
    with _opened_pdf(Path(path)) as pdf:
        return [_read_page(pdf.pages[number - 1], number) for number in range(first, last + 1)]


def read_banco_nacion_pdf(
    pdf_path: Path, *, max_workers: int | None = None
) -> BancoNacionPdfReadResult:
    if not pdf_path.is_file():
        raise InvalidPdfError("The PDF source is not a regular file")

    with _opened_pdf(pdf_path) as pdf:
        if not pdf.pages:
            raise InvalidPdfError("The PDF does not contain pages")
        page_count = len(pdf.pages)
        first_page = pdf.pages[0]
        width, height = _decimal(first_page.width), _decimal(first_page.height)

    whole_document: PageRange = (str(pdf_path), 1, page_count)
    workers = resolve_worker_count(page_count, max_workers)
    if workers == 1:
        readouts = _read_page_range(whole_document)
    else:
        try:
            readouts = sorted(
                read_pages_in_parallel(_read_page_range, pdf_path, page_count, workers),
                key=lambda item: item[0].page,
            )
        except ParallelReadUnavailableError:
            readouts = _read_page_range(whole_document)

    return BancoNacionPdfReadResult(
        probe=DocumentProbe(
            first_page_text=readouts[0][1],
            page_count=page_count,
            page_width=width,
            page_height=height,
        ),
        pages=tuple(readout for readout, _text in readouts),
    )
