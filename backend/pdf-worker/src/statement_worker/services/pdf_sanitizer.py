"""Validación estructural mínima y saneamiento no destructivo de PDF."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from os import name as os_name
from pathlib import Path
from shutil import rmtree
from tempfile import gettempdir
from uuid import uuid4

from statement_worker.domain.errors import InvalidPdfError, PdfSizeLimitError

PDF_HEADER = b"%PDF-"
PDF_EOF = b"%%EOF"
DEFAULT_MAX_PDF_BYTES = 50 * 1024 * 1024


@dataclass(frozen=True, slots=True)
class SanitizedPdf:
    content: bytes
    prefix_bytes_removed: int = 0
    suffix_bytes_removed: int = 0
    eof_found: bool = True

    @property
    def changed(self) -> bool:
        return self.prefix_bytes_removed > 0 or self.suffix_bytes_removed > 0


def sanitize_pdf_bytes(
    content: bytes,
    *,
    max_bytes: int = DEFAULT_MAX_PDF_BYTES,
    require_eof: bool = False,
) -> SanitizedPdf:
    """Devuelve el cuerpo PDF sin envoltura externa y sin mutar el origen."""

    if max_bytes < 1:
        raise ValueError("max_bytes must be positive")
    if not content:
        raise InvalidPdfError("The document is empty")
    if len(content) > max_bytes:
        raise PdfSizeLimitError("The document exceeds the configured size limit")

    start = content.find(PDF_HEADER)
    if start < 0:
        raise InvalidPdfError("The document does not contain a PDF header")

    eof = content.rfind(PDF_EOF)
    eof_found = eof >= 0
    if require_eof and not eof_found:
        raise InvalidPdfError("The document does not contain a PDF EOF marker")

    end = eof + len(PDF_EOF) if eof_found else len(content)
    sanitized = content[start:end]
    return SanitizedPdf(
        content=sanitized,
        prefix_bytes_removed=start,
        suffix_bytes_removed=len(content) - end,
        eof_found=eof_found,
    )


@contextmanager
def sanitized_pdf_path(
    source: Path,
    *,
    max_bytes: int = DEFAULT_MAX_PDF_BYTES,
    require_eof: bool = False,
    temporary_parent: Path | None = None,
) -> Iterator[Path]:
    """Expone una ruta legible y elimina cualquier copia temporal al salir."""

    if not source.is_file():
        raise InvalidPdfError("The PDF source is not a regular file")
    if source.stat().st_size > max_bytes:
        raise PdfSizeLimitError("The document exceeds the configured size limit")

    sanitized = sanitize_pdf_bytes(
        source.read_bytes(),
        max_bytes=max_bytes,
        require_eof=require_eof,
    )
    if not sanitized.changed:
        yield source
        return

    parent = Path(gettempdir()) if temporary_parent is None else temporary_parent
    if not parent.is_dir():
        raise InvalidPdfError("The configured temporary parent is not a directory")

    temporary_directory = parent / f"eecc_pdf_{uuid4().hex}"
    temporary_directory.mkdir()
    if os_name != "nt":  # pragma: no cover - Windows is the current CI platform.
        temporary_directory.chmod(0o700)
    try:
        temporary_path = temporary_directory / "document.pdf"
        temporary_path.write_bytes(sanitized.content)
        yield temporary_path
    finally:
        rmtree(temporary_directory, ignore_errors=False)
