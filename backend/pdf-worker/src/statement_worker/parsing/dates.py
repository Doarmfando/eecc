"""Parsing de fechas de estados de cuenta.

El formato numérico se interpreta como día/mes, que es el uso local. `mm/dd` no se
soporta a propósito: sin una señal del documento sería indistinguible y produciría
fechas equivocadas en silencio. El formato ISO sí se acepta porque es inequívoco.
"""

from __future__ import annotations

import re
from datetime import date

from .text import normalized_upper

_MONTHS = {
    "ENE": 1,
    "FEB": 2,
    "MAR": 3,
    "ABR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AGO": 8,
    "SET": 9,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DIC": 12,
    # Abreviaturas en inglés, presentes en estados de cuenta de otros países.
    "JAN": 1,
    "APR": 4,
    "AUG": 8,
    "DEC": 12,
    # Nombres completos en español.
    "ENERO": 1,
    "FEBRERO": 2,
    "MARZO": 3,
    "ABRIL": 4,
    "MAYO": 5,
    "JUNIO": 6,
    "JULIO": 7,
    "AGOSTO": 8,
    "SETIEMBRE": 9,
    "SEPTIEMBRE": 9,
    "OCTUBRE": 10,
    "NOVIEMBRE": 11,
    "DICIEMBRE": 12,
}


def _expand_year(value: str | None, default_year: int | None) -> int | None:
    if not value:
        return default_year
    year = int(value)
    if year < 100:
        return 2000 + year if year < 70 else 1900 + year
    return year


def _safe_date(year: int | None, month: int, day: int) -> date | None:
    if year is None or year < 1900:
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_statement_date(value: str | None, *, default_year: int | None = None) -> date | None:
    """Interpreta fechas numéricas o con abreviatura española de mes."""

    raw = normalized_upper(value).replace(".", "/").replace("-", "/")
    if not raw:
        return None

    # ISO `aaaa-mm-dd`: el único orden inequívoco, se comprueba antes que el local.
    iso = re.fullmatch(r"(\d{4})/(\d{1,2})/(\d{1,2})", raw)
    if iso:
        return _safe_date(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))

    numeric = re.fullmatch(r"(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?", raw)
    if numeric:
        return _safe_date(
            _expand_year(numeric.group(3), default_year),
            int(numeric.group(2)),
            int(numeric.group(1)),
        )

    month_names = "|".join(sorted(_MONTHS, key=len, reverse=True))
    textual = re.fullmatch(
        rf"(\d{{1,2}})\s*(?:/|\s|DE\s)?\s*({month_names})(?:\s*(?:/|\s|DE\s)?\s*(\d{{2,4}}))?",
        raw,
    )
    if textual:
        return _safe_date(
            _expand_year(textual.group(3), default_year),
            _MONTHS[textual.group(2)],
            int(textual.group(1)),
        )

    return None
