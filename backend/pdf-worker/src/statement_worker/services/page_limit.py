"""Límite de páginas por documento, aplicado antes de extraer."""

from __future__ import annotations

from pathlib import Path

import pypdfium2 as pdfium

from statement_worker.domain.errors import PdfPageLimitError

# Tope de la opción, no de un plan: protege de valores absurdos en la petición.
MAX_PAGE_LIMIT = 100_000


def count_pdf_pages(path: Path) -> int | None:
    """Páginas del PDF, o `None` si pdfium no lo abre.

    Contar con pdfium cuesta milisegundos aunque el documento tenga cientos de
    páginas: no hace falta leer ni una línea para saber que excede el límite.
    """

    try:
        document = pdfium.PdfDocument(path)
    except pdfium.PdfiumError:
        return None
    try:
        return len(document)
    finally:
        document.close()


def enforce_page_limit(path: Path, max_pages: int | None) -> None:
    """Rechaza el documento si supera `max_pages`; sin límite no hace nada.

    Si pdfium no puede contar, el documento sigue: su lector lo juzgará y la API
    comprueba de nuevo las páginas del resultado antes de registrarlo. Así un PDF
    raro no se rechaza por el contador y tampoco se salta el límite.

    Va antes de calcular la identidad del trabajo y no forma parte de ella: el
    resultado de un documento que pasa no depende del límite, así que repetir la
    misma subida da el mismo trabajo con cualquier plan (idempotencia).
    """

    if max_pages is None:
        return
    page_count = count_pdf_pages(path)
    if page_count is not None and page_count > max_pages:
        raise PdfPageLimitError(page_count=page_count, max_pages=max_pages)
