"""Interpretación pura de las filas visuales de un estado de cuenta del Banco de la Nación.

Todavía no se ha visto un documento real de este banco, así que la lectura no
depende de posiciones fijas ni de un único juego de rótulos. Se apoya en lo que el
propio documento declara:

- la cabecera de la tabla nombra las columnas de dinero (`CARGOS`/`DEBITOS`/`RETIROS`,
  `ABONOS`/`CREDITOS`/`DEPOSITOS`, `IMPORTE`/`MONTO` con signo, y `SALDO`); cada
  importe se asigna a la columna bajo la que está impreso;
- un movimiento empieza con su fecha (`dd/mm/aaaa`, `dd/mm` o `dd-MMM`), puede traer
  una segunda fecha valor y termina con sus importes;
- `SALDO ANTERIOR`, `SALDO FINAL`, `TOTAL CARGOS`, `TOTAL ABONOS` o una fila `TOTALES`
  declaran lo que después se reconcilia, estén dentro de la tabla o en un resumen
  encima de ella;
- `VAN`/`VIENEN` arrastran el saldo entre páginas y se comprueban como un punto de
  control más.

Lo que no encaja se señala con una advertencia en vez de adivinarse: el resultado
queda para revisión y nunca se da por correcto.
"""

from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, replace
from datetime import date
from decimal import Decimal
from enum import StrEnum
from itertools import pairwise

from statement_worker.parsing.amounts import parse_amount
from statement_worker.parsing.dates import parse_statement_date
from statement_worker.parsing.text import normalized_upper

from .models import (
    BancoNacionDocumentRows,
    BancoNacionPageMetrics,
    BancoNacionPageReadout,
    BancoNacionParsedRow,
    BancoNacionRowType,
    BancoNacionWarningCode,
    BancoNacionWord,
)

# Importe con dos decimales: con signo delante, signo detrás (`230.50-`), entre
# paréntesis o con el símbolo pegado. Exigir los decimales evita tomar por importe
# el número de una operación o de una agencia.
_MONEY = re.compile(
    r"^(?:S/\.?|US\$)?[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}-?$"
    r"|^\((?:S/\.?|US\$)?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)$"
)
_CURRENCY_WORDS = frozenset({"S/", "S/.", "US$"})
# El punto no se admite como separador de fecha: `01.06` también es un importe.
_DATE_TOKEN = re.compile(
    r"^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$|^\d{1,2}[/-]?[A-Z]{3}(?:[/-]?\d{2,4})?$"
)
_HAS_YEAR = re.compile(r"^\d{1,2}(?:[/-]\d{1,2}[/-]|[/-]?[A-Z]{3}[/-]?)\d{2,4}$")
_PAGE_NOISE = re.compile(r"\bPAG(?:INA)?\b|\bHOJA\b")

_DEBIT_LABELS = frozenset({"CARGO", "CARGOS", "DEBITO", "DEBITOS", "RETIRO", "RETIROS", "DEBE"})
_CREDIT_LABELS = frozenset(
    {"ABONO", "ABONOS", "CREDITO", "CREDITOS", "DEPOSITO", "DEPOSITOS", "HABER"}
)
_SIGNED_LABELS = frozenset({"IMPORTE", "MONTO"})
_DESCRIPTION_LABELS = frozenset({"DESCRIPCION", "CONCEPTO", "DETALLE", "GLOSA"})


class _Role(StrEnum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"
    SIGNED = "SIGNED"
    BALANCE = "BALANCE"


class _Label(StrEnum):
    OPENING = "OPENING"
    CLOSING = "CLOSING"
    CARRIED = "CARRIED"
    # `SALDO AL dd/mm`: abre el periodo si aún no hay movimientos, y si no, lo cierra.
    BALANCE_AT = "BALANCE_AT"
    TOTAL_DEBITS = "TOTAL_DEBITS"
    TOTAL_CREDITS = "TOTAL_CREDITS"
    # `TOTAL`/`TOTALES` sin decir de qué: cada importe vale por su columna.
    TOTALS_BY_COLUMN = "TOTALS_BY_COLUMN"


_BALANCE_LABELS = frozenset({_Label.OPENING, _Label.CLOSING, _Label.CARRIED, _Label.BALANCE_AT})
_CLOSING_KINDS = frozenset(
    {_Label.CLOSING, _Label.TOTALS_BY_COLUMN, _Label.TOTAL_DEBITS, _Label.TOTAL_CREDITS}
)

# (rótulo, palabras, solo al comienzo de la fila). Se prueban de más largo a más corto.
_PHRASES: tuple[tuple[_Label, tuple[str, ...], bool], ...] = tuple(
    sorted(
        (
            (_Label.OPENING, ("SALDO", "ANTERIOR"), False),
            (_Label.OPENING, ("SALDO", "INICIAL"), False),
            (_Label.CLOSING, ("SALDO", "FINAL"), False),
            (_Label.CLOSING, ("SALDO", "ACTUAL"), False),
            (_Label.CLOSING, ("NUEVO", "SALDO"), False),
            (_Label.BALANCE_AT, ("SALDO", "AL"), False),
            (_Label.TOTAL_DEBITS, ("TOTAL", "CARGOS"), False),
            (_Label.TOTAL_DEBITS, ("TOTAL", "DE", "CARGOS"), False),
            (_Label.TOTAL_DEBITS, ("TOTAL", "DEBITOS"), False),
            (_Label.TOTAL_DEBITS, ("TOTAL", "RETIROS"), False),
            (_Label.TOTAL_CREDITS, ("TOTAL", "ABONOS"), False),
            (_Label.TOTAL_CREDITS, ("TOTAL", "DE", "ABONOS"), False),
            (_Label.TOTAL_CREDITS, ("TOTAL", "CREDITOS"), False),
            (_Label.TOTAL_CREDITS, ("TOTAL", "DEPOSITOS"), False),
            (_Label.CARRIED, ("VAN",), True),
            (_Label.CARRIED, ("VIENEN",), True),
            (_Label.CARRIED, ("PASAN",), True),
            (_Label.CARRIED, ("TRANSPORTE",), True),
            (_Label.CARRIED, ("SALDO", "QUE", "PASA"), True),
            (_Label.CARRIED, ("SALDO", "QUE", "VIENE"), True),
            (_Label.TOTALS_BY_COLUMN, ("TOTALES",), True),
            (_Label.TOTALS_BY_COLUMN, ("TOTAL",), True),
        ),
        key=lambda phrase: -len(phrase[1]),
    )
)


def _token(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", normalized_upper(text))


def _money_role(token: str) -> _Role | None:
    if token in _DEBIT_LABELS:
        return _Role.DEBIT
    if token in _CREDIT_LABELS:
        return _Role.CREDIT
    if token in _SIGNED_LABELS:
        return _Role.SIGNED
    if token == "SALDO":
        return _Role.BALANCE
    return None


def _is_money(word: BancoNacionWord) -> bool:
    return _MONEY.match(word.text.upper()) is not None


def _money(word: BancoNacionWord) -> Decimal:
    amount = parse_amount(word.text)
    if amount is None:  # pragma: no cover - `_MONEY` ya garantiza que se puede leer.
        raise ValueError("amount could not be parsed")
    return amount


def _explicitly_signed(word: BancoNacionWord) -> bool:
    return word.text.startswith(("+", "-"))


@dataclass(frozen=True, slots=True)
class StatementPeriod:
    start: date
    end: date


def statement_period(first_page_text: str) -> StatementPeriod | None:
    """`DEL 01/06/2026 AL 30/06/2026`: da el año a las fechas que no lo traen."""

    match = re.search(
        r"(\d{1,2}/\d{1,2}/\d{4})\s*(?:AL|A|-|HASTA)\s*(\d{1,2}/\d{1,2}/\d{4})",
        normalized_upper(first_page_text),
    )
    if match is None:
        return None
    start = parse_statement_date(match.group(1))
    end = parse_statement_date(match.group(2))
    if start is None or end is None or start > end:
        return None
    return StatementPeriod(start, end)


def detect_currency(first_page_text: str) -> str | None:
    """La moneda de la cuenta; `None` si el documento no la dice o dice las dos."""

    text = normalized_upper(first_page_text)
    soles = re.search(r"\bSOLES\b|MONEDA\s*:?\s*S/", text) is not None
    dollars = re.search(r"\bDOLARES\b|US\$", text) is not None
    if soles == dollars:
        return None
    return "PEN" if soles else "USD"


def _resolve_date(
    token: str, period: StatementPeriod | None, default_year: int | None
) -> date | None:
    if _HAS_YEAR.search(normalized_upper(token)):
        return parse_statement_date(token)
    # Sin año: el mes se lee con un año bisiesto cualquiera y el año sale del periodo.
    provisional = parse_statement_date(token, default_year=2000)
    if provisional is None:
        return None
    if period is not None:
        same_year = period.start.year == period.end.year
        on_start_side = provisional.month >= period.start.month
        year = period.start.year if same_year or on_start_side else period.end.year
    elif default_year is not None:
        year = default_year
    else:
        return None
    try:
        return provisional.replace(year=year)
    except ValueError:
        return None


@dataclass(frozen=True, slots=True)
class _Span:
    x0: Decimal
    x1: Decimal

    def distance(self, word: BancoNacionWord) -> Decimal:
        # Mínimo entre alinear por la izquierda, por la derecha o por el centro: la
        # cabecera puede ir centrada sobre importes alineados a la derecha.
        center = (self.x0 + self.x1) / Decimal("2")
        return min(abs(word.x0 - self.x0), abs(word.x1 - self.x1), abs(word.center_x - center))


class _Columns:
    """Posición de las columnas de dinero y de la descripción, tomada de la cabecera."""

    def __init__(self) -> None:
        self.money: dict[_Role, _Span] = {}
        self.description_x0: Decimal | None = None

    @property
    def learned(self) -> bool:
        return bool(self.money)

    def learn(self, words: tuple[BancoNacionWord, ...]) -> None:
        money: dict[_Role, _Span] = {}
        description_x0: Decimal | None = None
        for word in words:
            token = _token(word.text)
            role = _money_role(token)
            if role is not None and role not in money:
                money[role] = _Span(word.x0, word.x1)
            if token in _DESCRIPTION_LABELS and description_x0 is None:
                description_x0 = word.x0
        if money:
            self.money = money
            self.description_x0 = description_x0

    def role_of(self, word: BancoNacionWord) -> _Role | None:
        ranked = sorted((span.distance(word), role) for role, span in self.money.items())
        if not ranked or (len(ranked) > 1 and ranked[0][0] == ranked[1][0]):
            return None
        return ranked[0][1]

    def is_continuation(self, words: tuple[BancoNacionWord, ...]) -> bool:
        """Texto bajo la descripción y a la izquierda de todo importe."""

        if self.description_x0 is None or not self.money:
            return False
        money_x0 = min(span.x0 for span in self.money.values())
        return words[0].x0 >= self.description_x0 - 2 and words[-1].x1 <= money_x0


def _is_header(words: tuple[BancoNacionWord, ...]) -> bool:
    tokens = {_token(word.text) for word in words}
    return (
        "FECHA" in tokens
        and "SALDO" in tokens
        and bool(tokens & _DESCRIPTION_LABELS)
        and bool(tokens & (_DEBIT_LABELS | _CREDIT_LABELS | _SIGNED_LABELS))
    )


def _prepare(raw_row: tuple[BancoNacionWord, ...]) -> tuple[BancoNacionWord, ...]:
    """Ordena, quita símbolos de moneda sueltos y une los signos separados del importe."""

    words = [
        word
        for word in sorted(raw_row, key=lambda word: word.x0)
        if word.text.upper() not in _CURRENCY_WORDS
    ]
    merged: list[BancoNacionWord] = []
    index = 0
    while index < len(words):
        word = words[index]
        following = words[index + 1] if index + 1 < len(words) else None
        if word.text in {"+", "-"} and following is not None and _is_money(following):
            merged.append(replace(following, text=f"{word.text}{following.text}", x0=word.x0))
            index += 2
            continue
        if word.text == "-" and merged and _is_money(merged[-1]) and "-" not in merged[-1].text:
            merged[-1] = replace(merged[-1], text=f"{merged[-1].text}-", x1=word.x1)
            index += 1
            continue
        merged.append(word)
        index += 1
    return tuple(merged)


def _trailing_amounts(
    words: tuple[BancoNacionWord, ...],
) -> tuple[tuple[BancoNacionWord, ...], tuple[BancoNacionWord, ...]]:
    cut = len(words)
    while cut > 0 and _is_money(words[cut - 1]):
        cut -= 1
    return words[:cut], words[cut:]


def _find_labels(words: tuple[BancoNacionWord, ...]) -> list[tuple[int, int, _Label]]:
    tokens = [_token(word.text) for word in words]
    found: list[tuple[int, int, _Label]] = []
    index = 0
    while index < len(tokens):
        for label, phrase, start_only in _PHRASES:
            end = index + len(phrase)
            if (not start_only or index == 0) and tuple(tokens[index:end]) == phrase:
                found.append((index, end, label))
                index = end
                break
        else:
            index += 1
    return found


def _amount_sides(
    amounts: tuple[BancoNacionWord, ...], columns: _Columns
) -> tuple[Decimal | None, Decimal | None, Decimal | None] | None:
    """(cargo, abono, saldo) de un movimiento, o `None` si no se puede decidir."""

    if not columns.learned:
        # Sin cabecera solo se acepta lo inequívoco: importe con signo y su saldo.
        if len(amounts) != 2 or not _explicitly_signed(amounts[0]):
            return None
        value = _money(amounts[0])
        if value == 0:
            return None
        return (
            (-value, None, _money(amounts[1])) if value < 0 else (None, value, _money(amounts[1]))
        )

    debit: Decimal | None = None
    credit: Decimal | None = None
    balance: Decimal | None = None
    for word in amounts:
        role = columns.role_of(word)
        value = _money(word)
        if role is _Role.BALANCE and balance is None:
            balance = value
        elif role is _Role.DEBIT and debit is None and credit is None:
            debit = abs(value)
        elif role is _Role.CREDIT and debit is None and credit is None:
            credit = abs(value)
        elif role is _Role.SIGNED and debit is None and credit is None and value != 0:
            debit, credit = (-value, None) if value < 0 else (None, value)
        else:
            return None
    if (debit is None) == (credit is None):
        return None
    return debit, credit, balance


@dataclass(slots=True)
class _Declared:
    opening: Decimal | None = None
    closing: Decimal | None = None
    carried: Decimal | None = None
    debits: Decimal | None = None
    credits: Decimal | None = None


def _declarations(
    words: tuple[BancoNacionWord, ...],
    *,
    columns: _Columns,
    page: int,
    movements_read: bool,
) -> tuple[BancoNacionParsedRow, ...] | None:
    """Saldos y totales que la fila declara, o `None` si no declara ninguno con certeza."""

    labels = _find_labels(words)
    if not labels:
        return None
    money = [(index, word) for index, word in enumerate(words) if _is_money(word)]
    declared = _Declared()
    used: set[int] = set()
    kinds: set[_Label] = set()

    for position, (_start, end, label) in enumerate(labels):
        limit = labels[position + 1][0] if position + 1 < len(labels) else len(words)
        candidates = [(index, word) for index, word in money if end <= index < limit]
        if not candidates:
            continue
        if label in _BALANCE_LABELS:
            # Con varios importes tras el rótulo, el saldo es el de su columna.
            in_balance = [item for item in candidates if columns.role_of(item[1]) is _Role.BALANCE]
            if len(in_balance) == 1:
                chosen = in_balance[0]
            elif len(candidates) == 1:
                chosen = candidates[0]
            else:
                continue
            value = _money(chosen[1])
            if label is _Label.CARRIED:
                declared.carried = value
            elif label is _Label.CLOSING or (label is _Label.BALANCE_AT and movements_read):
                declared.closing = value
            else:
                declared.opening = value
            used.add(chosen[0])
            kinds.add(_Label.CLOSING if label is _Label.BALANCE_AT and movements_read else label)
        elif label in (_Label.TOTAL_DEBITS, _Label.TOTAL_CREDITS):
            index, word = candidates[0]
            if label is _Label.TOTAL_DEBITS:
                declared.debits = abs(_money(word))
            else:
                declared.credits = abs(_money(word))
            used.add(index)
            kinds.add(label)
        else:
            kinds.add(label)

    # Importes sin rótulo propio en una fila de totales o de cierre: valen por su columna.
    closes = bool(kinds & _CLOSING_KINDS)
    for index, word in money:
        if index in used:
            continue
        role = columns.role_of(word) if columns.learned and closes else None
        if role is _Role.DEBIT and declared.debits is None:
            declared.debits = abs(_money(word))
        elif role is _Role.CREDIT and declared.credits is None:
            declared.credits = abs(_money(word))
        elif role is _Role.BALANCE and declared.closing is None:
            declared.closing = _money(word)
        else:
            return None

    rows: list[BancoNacionParsedRow] = []
    if declared.opening is not None:
        # Un saldo «anterior» a mitad del documento es el arrastre de la página previa.
        row_type = (
            BancoNacionRowType.CARRIED_BALANCE
            if movements_read
            else BancoNacionRowType.OPENING_BALANCE
        )
        rows.append(
            BancoNacionParsedRow(row_type, page, "SALDO ANTERIOR", balance=declared.opening)
        )
    if declared.carried is not None:
        rows.append(
            BancoNacionParsedRow(
                BancoNacionRowType.CARRIED_BALANCE,
                page,
                "SALDO ARRASTRADO",
                balance=declared.carried,
            )
        )
    if declared.debits is not None or declared.credits is not None:
        rows.append(
            BancoNacionParsedRow(
                BancoNacionRowType.DECLARED_TOTALS,
                page,
                "TOTALES",
                debit=declared.debits,
                credit=declared.credits,
            )
        )
    if declared.closing is not None:
        rows.append(
            BancoNacionParsedRow(
                BancoNacionRowType.CLOSING_BALANCE, page, "SALDO FINAL", balance=declared.closing
            )
        )
    return tuple(rows) or None


def _continuation_gap(readout: BancoNacionPageReadout) -> Decimal | None:
    """Hueco vertical máximo entre una línea y la que la continúa en esta página."""

    tops = [row[0].top for row in readout.rows if row]
    gaps = [current - previous for previous, current in pairwise(tops)]
    if not gaps:
        return None
    return Decimal(str(statistics.median(gaps))) * Decimal("1.5")


def read_banco_nacion_rows(
    pages: tuple[BancoNacionPageReadout, ...],
    *,
    first_page_text: str = "",
    default_year: int | None = None,
) -> BancoNacionDocumentRows:
    """Recorre las páginas en orden y devuelve movimientos y declaraciones.

    En una página con cabecera, lo que está por encima son datos del titular o un
    resumen: de ahí solo se toman los saldos y totales rotulados.
    """

    period = statement_period(first_page_text)
    rows: list[BancoNacionParsedRow] = []
    warnings: list[BancoNacionWarningCode] = []
    metrics: list[BancoNacionPageMetrics] = []
    columns = _Columns()
    header_seen = False
    movements_read = False

    for readout in pages:
        prepared = tuple(_prepare(row) for row in readout.rows)
        header_index = next(
            (index for index, words in enumerate(prepared) if words and _is_header(words)), None
        )
        metrics.append(
            BancoNacionPageMetrics(
                page=readout.page,
                word_count=readout.word_count,
                row_count=len(readout.rows),
                header_detected=header_index is not None,
            )
        )
        if header_index is not None:
            columns.learn(prepared[header_index])
            header_seen = True

        max_gap = _continuation_gap(readout)
        # Índice en `rows` del movimiento que aún admite líneas de continuación, y
        # altura de la última línea que se le unió. No cruza páginas.
        target: int | None = None
        target_top: Decimal | None = None

        for index, words in enumerate(prepared):
            if not words or index == header_index:
                continue
            if _is_header(words):
                columns.learn(words)
                target = None
                continue

            above_header = header_index is not None and index < header_index
            if above_header:
                declared = _declarations(
                    words, columns=columns, page=readout.page, movements_read=movements_read
                )
                if declared is not None:
                    rows.extend(declared)
                continue

            if _DATE_TOKEN.match(normalized_upper(words[0].text)):
                rest = words[1:]
                value_date: date | None = None
                if rest and _DATE_TOKEN.match(normalized_upper(rest[0].text)):
                    value_date = _resolve_date(rest[0].text, period, default_year)
                    rest = rest[1:]
                has_money = any(_is_money(word) for word in rest)
                labels = _find_labels(rest)
                if labels and labels[0][0] == 0:
                    declared = _declarations(
                        rest, columns=columns, page=readout.page, movements_read=movements_read
                    )
                    if declared is not None:
                        rows.extend(declared)
                    elif has_money:
                        warnings.append(BancoNacionWarningCode.ROW_UNCLASSIFIED)
                    target = None
                    continue

                text_words, amounts = _trailing_amounts(rest)
                if not amounts:
                    # Un importe en medio del texto no es una forma conocida de movimiento.
                    if has_money:
                        warnings.append(BancoNacionWarningCode.ROW_UNCLASSIFIED)
                    target = None
                    continue
                posting_date = _resolve_date(words[0].text, period, default_year)
                if posting_date is None:
                    warnings.append(
                        BancoNacionWarningCode.DATE_WITHOUT_YEAR
                        if not _HAS_YEAR.search(normalized_upper(words[0].text))
                        else BancoNacionWarningCode.ROW_UNCLASSIFIED
                    )
                    target = None
                    continue
                sides = _amount_sides(amounts, columns)
                if sides is None:
                    warnings.append(BancoNacionWarningCode.AMOUNT_SIDE_UNKNOWN)
                    target = None
                    continue
                debit, credit, balance = sides
                rows.append(
                    BancoNacionParsedRow(
                        row_type=BancoNacionRowType.MOVEMENT,
                        page=readout.page,
                        description=" ".join(word.text for word in text_words),
                        posting_date=posting_date,
                        value_date=value_date,
                        debit=debit,
                        credit=credit,
                        balance=balance,
                    )
                )
                movements_read = True
                target, target_top = len(rows) - 1, words[0].top
                continue

            declared = _declarations(
                words, columns=columns, page=readout.page, movements_read=movements_read
            )
            if declared is not None:
                rows.extend(declared)
                target = None
                continue

            if not any(_is_money(word) for word in words):
                text = " ".join(word.text for word in words)
                joins = (
                    target is not None
                    and target_top is not None
                    and (max_gap is None or words[0].top - target_top <= max_gap)
                    and columns.is_continuation(words)
                    and _PAGE_NOISE.search(normalized_upper(text)) is None
                )
                if joins and target is not None:
                    previous = rows[target]
                    rows[target] = replace(
                        previous, description=f"{previous.description} {text}".strip()
                    )
                    target_top = words[0].top
                else:
                    target = None
                continue

            # Una fila con importes que no es movimiento ni declaración podría ser un
            # movimiento perdido: el resultado no puede darse por bueno.
            warnings.append(BancoNacionWarningCode.ROW_UNCLASSIFIED)
            target = None

    if not header_seen:
        warnings.insert(0, BancoNacionWarningCode.HEADER_NOT_FOUND)

    return BancoNacionDocumentRows(
        rows=tuple(rows),
        page_metrics=tuple(metrics),
        warning_codes=tuple(dict.fromkeys(warnings)),
        currency=detect_currency(first_page_text),
    )
