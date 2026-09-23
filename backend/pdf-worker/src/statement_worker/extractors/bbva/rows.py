"""Interpretación pura de las filas visuales de un estado de cuenta del BBVA.

La plantilla se confirmó con un documento real de cuenta corriente en dólares. Su
tabla lleva la cabecera repartida en tres líneas:

    FECHA        FECHA                                              SALDO
                 DESCRIPCION  OFICINA  CAN  N OPER.  CARGO/ABONO    ITF
    OPER.        VALOR                                              CONTABLE

Tres rasgos la distinguen de las demás plantillas del proyecto:

- `CARGO/ABONO` es **una sola columna con signo**: el cargo va negativo y el abono
  positivo, en vez de dos columnas de magnitudes;
- el **ITF tiene columna propia** y descuenta del saldo. Comprobado sobre el
  documento real: `saldo = anterior + cargo - itf` cuadra en las 59 transiciones,
  mientras que ignorar el impuesto falla en 28;
- las fechas son `dd-mm` **sin año**, y el documento no declara periodo. El año
  sale de la fecha de emisión del pie (`dd-mm-aaaa`): un mes posterior al de
  emisión pertenece al año anterior, que es como se fecha un periodo que cruza
  diciembre. Sin esa fecha ni `default_year`, la fila se señala y no se adivina.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum

from statement_worker.parsing.amounts import parse_amount
from statement_worker.parsing.text import normalized_upper

from .models import (
    BbvaDocumentRows,
    BbvaPageMetrics,
    BbvaPageReadout,
    BbvaParsedRow,
    BbvaRowType,
    BbvaWarningCode,
    BbvaWord,
)

_MONEY = re.compile(r"^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$")
# Fecha del movimiento: `dd-mm`, sin año. Con año es la emisión, no un movimiento.
_SHORT_DATE = re.compile(r"^(\d{1,2})-(\d{1,2})$")
_ISSUE_DATE = re.compile(r"\b(\d{1,2})-(\d{1,2})-(\d{4})\b")

_ITF_TOTAL_LABELS = ("CARGOS", "ABONOS", "DEVOLUCIONES", "PAGOS")

# Pie de página: los datos de entidad, oficina y cuenta junto al aviso de banca por
# internet. Cae fuera de la tabla y a veces arrastra una cifra, así que sin esto se
# señalaría como fila con importes sin clasificar y el documento nunca quedaría
# demostrado. Se reconoce por el aviso, no por su posición.
_FOOTER_NOISE = re.compile(r"BANCA\s+POR\s+INTERNET|WWW\.", re.IGNORECASE)


class _Role(StrEnum):
    AMOUNT = "AMOUNT"
    ITF = "ITF"
    BALANCE = "BALANCE"


# Rótulo de cabecera -> papel de la columna. `SALDO` a secas vale: la cabecera lo
# parte en `SALDO` (primera línea) y `CONTABLE` (tercera), y las dos caen sobre la
# misma columna, así que cualquiera de ellas la nombra.
_COLUMN_LABELS: tuple[tuple[re.Pattern[str], _Role], ...] = (
    (re.compile(r"^CARGO/?ABONO$"), _Role.AMOUNT),
    (re.compile(r"^ITF$"), _Role.ITF),
    (re.compile(r"^SALDO$|^CONTABLE$"), _Role.BALANCE),
)


def _token(text: str) -> str:
    return re.sub(r"[^A-Z0-9/]", "", normalized_upper(text))


def _is_money(word: BbvaWord) -> bool:
    return _MONEY.match(word.text) is not None


def _money(word: BbvaWord) -> Decimal:
    amount = parse_amount(word.text)
    if amount is None:  # pragma: no cover - `_MONEY` ya garantiza que se puede leer.
        raise ValueError("amount could not be parsed")
    return amount


def issue_date(first_page_text: str) -> date | None:
    """Fecha de emisión del pie: la única del documento que trae el año."""

    match = _ISSUE_DATE.search(first_page_text)
    if match is None:
        return None
    day, month, year = (int(group) for group in match.groups())
    try:
        return date(year, month, day)
    except ValueError:
        return None


def detect_currency(first_page_text: str) -> str | None:
    """La moneda que declara `MONEDA:`; `None` si no la dice o dice las dos."""

    text = normalized_upper(first_page_text)
    soles = re.search(r"MONEDA\s*:?\s*SOLES|\bNUEVOS\s+SOLES\b", text) is not None
    dollars = re.search(r"MONEDA\s*:?\s*DOLARES|US\$", text) is not None
    if soles == dollars:
        return None
    return "PEN" if soles else "USD"


def resolve_short_date(token: str, issued: date | None, default_year: int | None) -> date | None:
    """`dd-mm` al año que le corresponde.

    Un mes posterior al de emisión no puede ser del mismo año —un estado de cuenta
    no informa del futuro—, así que pertenece al anterior. Es lo que fecha bien un
    periodo que cruza diciembre.
    """

    match = _SHORT_DATE.match(token)
    if match is None:
        return None
    day, month = int(match.group(1)), int(match.group(2))
    if issued is not None:
        year = issued.year if month <= issued.month else issued.year - 1
    elif default_year is not None:
        year = default_year
    else:
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


@dataclass(frozen=True, slots=True)
class _Span:
    x0: Decimal
    x1: Decimal

    def distance(self, word: BbvaWord) -> Decimal:
        center = (self.x0 + self.x1) / Decimal("2")
        return min(abs(word.x0 - self.x0), abs(word.x1 - self.x1), abs(word.center_x - center))


class _Columns:
    """Posición de las tres columnas de dinero, tomada de la cabecera."""

    def __init__(self) -> None:
        self.spans: dict[_Role, _Span] = {}

    @property
    def learned(self) -> bool:
        return _Role.AMOUNT in self.spans and _Role.BALANCE in self.spans

    def learn(self, words: tuple[BbvaWord, ...]) -> None:
        for word in words:
            token = _token(word.text)
            for pattern, role in _COLUMN_LABELS:
                if pattern.match(token) and role not in self.spans:
                    self.spans[role] = _Span(word.x0, word.x1)

    def role_of(self, word: BbvaWord) -> _Role | None:
        ranked = sorted((span.distance(word), role) for role, span in self.spans.items())
        if not ranked or (len(ranked) > 1 and ranked[0][0] == ranked[1][0]):
            return None
        return ranked[0][1]


def _split_amounts(
    amounts: tuple[BbvaWord, ...], columns: _Columns
) -> tuple[Decimal, Decimal | None, Decimal] | None:
    """(importe con signo, itf, saldo) de un movimiento, o `None` si no se decide.

    Un movimiento siempre trae importe y saldo; el ITF solo cuando la operación lo
    paga. El reparto se hace por **orden**, no por cercanía al rótulo: las tres
    columnas van siempre en el mismo orden de izquierda a derecha —`CARGO/ABONO`,
    `ITF`, `SALDO CONTABLE`— y están lo bastante juntas como para que la distancia
    al rótulo más cercano se decida por un par de puntos, que es demasiado frágil.

    La geometría sí se usa para comprobar el resultado: el saldo tiene que caer en
    la columna de saldo, que es la única separada del resto. Si no cae ahí, la fila
    se señala en vez de interpretarse a la fuerza.
    """

    if not columns.learned or not 2 <= len(amounts) <= 3:
        return None
    ordered = sorted(amounts, key=lambda word: word.x0)
    balance_word = ordered[-1]
    if columns.role_of(balance_word) is not _Role.BALANCE:
        return None

    amount = _money(ordered[0])
    itf = _money(ordered[1]) if len(ordered) == 3 else None
    if itf is not None and itf < 0:
        return None
    return amount, itf, _money(balance_word)


def _is_header(words: tuple[BbvaWord, ...]) -> bool:
    """La línea de cabecera que nombra `CARGO/ABONO`: es la que trae las columnas."""

    return any(_token(word.text) == "CARGO/ABONO" for word in words)


def _itf_totals(words: tuple[BbvaWord, ...], page: int) -> BbvaParsedRow | None:
    """Una línea del bloque `TOTALES POR ITF`: un rótulo y su importe."""

    texts = [_token(word.text) for word in words if not _is_money(word)]
    amounts = [word for word in words if _is_money(word)]
    if len(texts) != 1 or len(amounts) != 1 or texts[0] not in _ITF_TOTAL_LABELS:
        return None
    return BbvaParsedRow(
        row_type=BbvaRowType.DECLARED_ITF_TOTALS,
        page=page,
        label=texts[0],
        itf=abs(_money(amounts[0])),
    )


def _opening_balance(words: tuple[BbvaWord, ...], page: int) -> BbvaParsedRow | None:
    tokens = [_token(word.text) for word in words if not _is_money(word)]
    amounts = [word for word in words if _is_money(word)]
    if tokens[:2] != ["SALDO", "ANTERIOR"] or len(amounts) != 1:
        return None
    return BbvaParsedRow(
        row_type=BbvaRowType.OPENING_BALANCE,
        page=page,
        description="SALDO ANTERIOR",
        balance=_money(amounts[0]),
    )


def _trailing_amounts(
    words: tuple[BbvaWord, ...],
) -> tuple[tuple[BbvaWord, ...], tuple[BbvaWord, ...]]:
    cut = len(words)
    while cut > 0 and _is_money(words[cut - 1]):
        cut -= 1
    return words[:cut], words[cut:]


def read_bbva_rows(
    pages: tuple[BbvaPageReadout, ...],
    *,
    first_page_text: str = "",
    default_year: int | None = None,
) -> BbvaDocumentRows:
    """Recorre las páginas en orden y devuelve movimientos y declaraciones."""

    issued = issue_date(first_page_text)
    rows: list[BbvaParsedRow] = []
    warnings: list[BbvaWarningCode] = []
    metrics: list[BbvaPageMetrics] = []
    columns = _Columns()
    header_seen = False
    openings = 0

    for readout in pages:
        header_index = next(
            (index for index, words in enumerate(readout.rows) if words and _is_header(words)),
            None,
        )
        header_seen = header_seen or header_index is not None
        metrics.append(
            BbvaPageMetrics(
                page=readout.page,
                word_count=readout.word_count,
                row_count=len(readout.rows),
                header_detected=header_index is not None,
            )
        )

        # La cabecera ocupa tres líneas y solo se aprende de ese bloque. Aprender de
        # cualquier fila haría que el `SALDO` del título del documento —«MOVIMIENTO
        # Y SALDO A LA FECHA», impreso a la izquierda— se tomara por la columna de
        # saldo, que está al otro extremo de la página.
        if header_index is not None:
            block = range(max(header_index - 1, 0), min(header_index + 2, len(readout.rows)))
            for index in block:
                columns.learn(readout.rows[index])

        for index, words in enumerate(readout.rows):
            if not words or (header_index is not None and index in block):
                continue

            opening = _opening_balance(words, readout.page)
            if opening is not None:
                openings += 1
                if openings > 1:
                    warnings.append(BbvaWarningCode.DUPLICATE_OPENING_BALANCE)
                else:
                    rows.append(opening)
                continue

            totals = _itf_totals(words, readout.page)
            if totals is not None:
                rows.append(totals)
                continue

            if _FOOTER_NOISE.search(" ".join(word.text for word in words)):
                continue

            if not _SHORT_DATE.match(words[0].text):
                if any(_is_money(word) for word in words):
                    warnings.append(BbvaWarningCode.ROW_UNCLASSIFIED)
                continue

            rest = words[1:]
            value_date: date | None = None
            if rest and _SHORT_DATE.match(rest[0].text):
                value_date = resolve_short_date(rest[0].text, issued, default_year)
                rest = rest[1:]

            text_words, amounts = _trailing_amounts(rest)
            if not amounts:
                if any(_is_money(word) for word in rest):
                    warnings.append(BbvaWarningCode.ROW_UNCLASSIFIED)
                continue

            posting_date = resolve_short_date(words[0].text, issued, default_year)
            if posting_date is None:
                warnings.append(BbvaWarningCode.DATE_WITHOUT_YEAR)
                continue

            split = _split_amounts(amounts, columns)
            if split is None:
                warnings.append(BbvaWarningCode.AMOUNT_COLUMN_UNKNOWN)
                continue

            amount, itf, balance = split
            rows.append(
                BbvaParsedRow(
                    row_type=BbvaRowType.MOVEMENT,
                    page=readout.page,
                    description=" ".join(word.text for word in text_words),
                    posting_date=posting_date,
                    value_date=value_date,
                    amount=amount,
                    itf=itf,
                    balance=balance,
                )
            )

    if not header_seen:
        warnings.insert(0, BbvaWarningCode.HEADER_NOT_FOUND)

    return BbvaDocumentRows(
        rows=tuple(rows),
        page_metrics=tuple(metrics),
        warning_codes=tuple(dict.fromkeys(warnings)),
        currency=detect_currency(first_page_text),
    )
