"""Nombre visible del PDF, con la misma limpieza que aplica la API (ADR-0011)."""

from __future__ import annotations

import re
import unicodedata

SOURCE_FILE_NAME_MAX_LENGTH = 255

# Las marcas que invierten el sentido del texto (`\p{Bidi_Control}`): con ellas un
# `.pdf` puede leerse como otra extensión.
_BIDI_CONTROLS = frozenset(
    "\u061c\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069"
)


def normalize_source_file_name(value: str) -> str | None:
    """Etiqueta sin rutas, controles ni marcas bidireccionales; `None` si queda vacía."""

    basename = re.split(r"[\\/]", value)[-1]
    clean = "".join(
        character
        for character in unicodedata.normalize("NFC", basename)
        if unicodedata.category(character) != "Cc" and character not in _BIDI_CONTROLS
    ).strip()
    if not clean or clean in {".", ".."}:
        return None
    return clean[:SOURCE_FILE_NAME_MAX_LENGTH]
