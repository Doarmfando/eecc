# Stub mínimo: `pypdfium2` no publica tipos.
#
# Llega como dependencia de `pdfplumber` y el worker lo usa directamente solo para
# abrir estados de cuenta protegidos con contraseña (`services/pdf_unlock.py`).
# Aquí está únicamente lo que ese módulo toca.
from pathlib import Path

from . import raw as raw

class PdfiumError(RuntimeError):
    err_code: int | None

class PdfDocument:
    def __init__(
        self,
        input: str | Path | bytes,
        password: str | None = None,
        autoclose: bool = False,
    ) -> None: ...
    def save(self, dest: str | Path, version: int | None = None, flags: int = 0) -> None: ...
    def close(self) -> None: ...
