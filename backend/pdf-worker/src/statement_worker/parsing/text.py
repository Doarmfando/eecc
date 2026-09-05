"""Normalización de texto sin conservar datos fuera del proceso."""

import re
import unicodedata


def normalize_spaces(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", str(value).replace("\n", " ")).strip()


def normalized_upper(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", normalize_spaces(value))
    without_accents = "".join(char for char in normalized if not unicodedata.combining(char))
    return without_accents.upper()
