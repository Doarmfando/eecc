"""Parsing de fechas de estados de cuenta.

El formato numérico se interpreta como día/mes, que es el uso local. `mm/dd` no se
soporta a propósito: sin una señal del documento sería indistinguible y produciría
fechas equivocadas en silencio. El formato ISO sí se acepta porque es inequívoco.

Una fecha sin año toma el año del periodo que declara el documento, y no el de su
cierre: el estado de cuenta de enero puede traer un movimiento del 31 de diciembre,
que es del año anterior.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
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


@dataclass(frozen=True, slots=True)
class StatementPeriod:
    """`DEL 01/01/2026 AL 31/01/2026`: lo que cubre un estado de cuenta."""

    start: date
    end: date

    def place(self, month: int, day: int) -> date | None:
        """El día y mes en el año que lo deja más cerca del periodo.

        Dentro del periodo la distancia es cero; fuera, un movimiento que llega con
        retraso o una fecha valor posterior al cierre quedan a días, y el mismo día de
        otro año, a meses.
        """

        candidates = [
            candidate
            for year in range(self.start.year - 1, self.end.year + 2)
            if (candidate := _safe_date(year, month, day)) is not None
        ]
        if not candidates:
            return None
        return min(candidates, key=lambda candidate: (self._distance(candidate), candidate))

    def _distance(self, value: date) -> int:
        if value < self.start:
            return (self.start - value).days
        if value > self.end:
            return (value - self.end).days
        return 0


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


def _resolve(
    year_text: str | None,
    month: int,
    day: int,
    *,
    default_year: int | None,
    period: StatementPeriod | None,
) -> date | None:
    # El año impreso manda; sin él, el periodo del documento y, a falta de periodo,
    # el año indicado al subirlo.
    if not year_text and period is not None:
        return period.place(month, day)
    return _safe_date(_expand_year(year_text, default_year), month, day)


def parse_statement_date(
    value: str | None,
    *,
    default_year: int | None = None,
    period: StatementPeriod | None = None,
) -> date | None:
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
        return _resolve(
            numeric.group(3),
            int(numeric.group(2)),
            int(numeric.group(1)),
            default_year=default_year,
            period=period,
        )

    month_names = "|".join(sorted(_MONTHS, key=len, reverse=True))
    textual = re.fullmatch(
        rf"(\d{{1,2}})\s*(?:/|\s|DE\s)?\s*({month_names})(?:\s*(?:/|\s|DE\s)?\s*(\d{{2,4}}))?",
        raw,
    )
    if textual:
        return _resolve(
            textual.group(3),
            _MONTHS[textual.group(2)],
            int(textual.group(1)),
            default_year=default_year,
            period=period,
        )

    return None
