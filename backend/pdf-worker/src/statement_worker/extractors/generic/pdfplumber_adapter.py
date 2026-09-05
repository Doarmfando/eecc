"""Adaptador pdfplumber para tablas genéricas: único límite que conoce la librería."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

import pdfplumber

from statement_worker.domain.errors import InvalidPdfError
from statement_worker.domain.models import DocumentProbe
from statement_worker.extractors.page_parallelism import (
    PageRange,
    ParallelReadUnavailableError,
    read_pages_in_parallel,
    resolve_worker_count,
)

from .rows import Table
from .word_grid import GridWord, build_page_grids

# Dos estrategias: tablas con líneas dibujadas y tablas alineadas solo por texto.
# Páginas que se leen para decidir si el documento es un estado de cuenta.
PROBE_PAGES = 3

_TABLE_SETTINGS: tuple[dict[str, Any], ...] = (
    {"vertical_strategy": "lines", "horizontal_strategy": "lines"},
    {
        "vertical_strategy": "text",
        "horizontal_strategy": "text",
        "text_x_tolerance": 2,
        "text_y_tolerance": 3,
    },
)


@dataclass(frozen=True, slots=True)
class GenericPageTables:
    page: int
    tables: tuple[Table, ...]


@dataclass(frozen=True, slots=True)
class GenericReadResult:
    probe: DocumentProbe
    pages: tuple[GenericPageTables, ...]
    grids: tuple[tuple[int, Table], ...] = ()


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


def _as_table(raw: list[list[str | None]]) -> Table:
    return tuple(tuple(row) for row in raw)


@dataclass(frozen=True, slots=True)
class _PageReadout:
    """Lo leído de una página, en tipos que pueden viajar entre procesos."""

    page: int
    tables: tuple[Table, ...]
    words: tuple[GridWord, ...]


def _read_single_page(page: pdfplumber.page.Page, page_number: int) -> _PageReadout:
    """Extrae tablas y palabras de una página. No interpreta nada."""

    tables: list[Table] = []
    for settings in _TABLE_SETTINGS:
        try:
            extracted = page.extract_tables(table_settings=settings) or []
        except Exception:  # Una estrategia puede no aplicar a esta página.
            continue
        tables.extend(_as_table(table) for table in extracted if table)
        if tables:
            # La primera estrategia que produce tablas es la que describe la página.
            break

    words = tuple(
        GridWord(
            page=page_number,
            top=Decimal(str(word["top"])),
            x0=Decimal(str(word["x0"])),
            x1=Decimal(str(word["x1"])),
            text=str(word["text"]),
        )
        for word in page.extract_words(x_tolerance=1, y_tolerance=2) or []
    )
    return _PageReadout(page=page_number, tables=tuple(tables), words=words)


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


def read_generic_tables(
    pdf_path: Path,
    *,
    max_pages: int | None = None,
    max_workers: int | None = None,
) -> GenericReadResult:
    """Extrae las tablas de cada página con ambas estrategias, sin interpretarlas.

    Un banco cualquiera puede traer tantas páginas como el BCP, y aquí cada una
    cuesta más: dos estrategias de tabla además de las palabras. Las páginas se
    reparten entre procesos y el resultado se reordena, igual que en el BCP.
    """

    if not pdf_path.is_file():
        raise InvalidPdfError("The PDF source is not a regular file")

    with _opened_pdf(pdf_path) as pdf:
        if not pdf.pages:
            raise InvalidPdfError("The PDF does not contain pages")

        # La detección mira las primeras páginas: una portada puede preceder a la
        # tabla, y el encabezado no siempre está en la página 1.
        probe_text = "\n".join(
            page.extract_text(x_tolerance=1, y_tolerance=3) or ""
            for page in pdf.pages[:PROBE_PAGES]
        )
        probe = DocumentProbe(first_page_text=probe_text, page_count=len(pdf.pages))

        limit = len(pdf.pages) if max_pages is None else min(max_pages, len(pdf.pages))

    readouts = _read_every_page(pdf_path, limit, resolve_worker_count(limit, max_workers))
    pages = tuple(
        GenericPageTables(page=readout.page, tables=readout.tables) for readout in readouts
    )
    words = tuple(word for readout in readouts for word in readout.words)
    grids, _bounds = build_page_grids(words)
    return GenericReadResult(probe=probe, pages=pages, grids=grids)
