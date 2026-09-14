"""Interpretación pura de las filas visuales de la plantilla Interbank.

Semántica de la plantilla, observada en un estado de cuenta real:

- cada página repite la cabecera `Fecha | Concepto | Ingresos | Gastos | Saldo Contable`;
- el saldo inicial va en una fila `EMPEZASTE <MES> CON <saldo>`;
- un movimiento es `dd/mm/aaaa <concepto> <importe con signo> <saldo>`, y el signo dice
  la columna: `+` es ingreso y `-` es gasto;
- el cierre es `SALDO CONTABLE AL dd/mm <+ingresos> <-gastos> <saldo final>`;
- tras el cierre el banco añade una página publicitaria y otra que explica cómo leer
  el estado de cuenta **con un ejemplo inventado** que trae su propia cabecera, saldo
  inicial y movimientos. Leerla mezclaría movimientos ajenos con los reales.
"""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal

from statement_worker.parsing.amounts import parse_amount
from statement_worker.parsing.dates import parse_statement_date
from statement_worker.parsing.text import normalized_upper

from .models import (
    InterbankDocumentRows,
    InterbankPageMetrics,
    InterbankPageReadout,
    InterbankParsedRow,
    InterbankRowType,
    InterbankWarningCode,
    InterbankWord,
)

# Importe monetario con dos decimales, con o sin signo. Exigir los decimales evita
# confundir con importes los números de un concepto, como `TIENDA 305`.
_MONEY = re.compile(r"^[+-]?\d{1,3}(?:,\d{3})*\.\d{2}$|^[+-]?\d+\.\d{2}$")
_FULL_DATE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
_GUIDE_MARKER = "TE AYUDAMOS A CONOCER"
_HEADER_SIGNALS = ("FECHA", "CONCEPTO", "INGRESOS", "GASTOS", "SALDO")


def _merge_detached_signs(words: tuple[InterbankWord, ...]) -> tuple[InterbankWord, ...]:
    """Une un `+` o `-` suelto con el importe que lo sigue.

    Según el espaciado del PDF, el signo puede quedar como palabra propia.
    """

    merged: list[InterbankWord] = []
    index = 0
    while index < len(words):
        word = words[index]
        following = words[index + 1] if index + 1 < len(words) else None
        if word.text in {"+", "-"} and following is not None and _MONEY.match(following.text):
            merged.append(
                InterbankWord(
                    text=f"{word.text}{following.text}",
                    x0=word.x0,
                    x1=following.x1,
                    top=following.top,
                )
            )
            index += 2
            continue
        merged.append(word)
        index += 1
    return tuple(merged)


def _is_money(word: InterbankWord) -> bool:
    return _MONEY.match(word.text) is not None


def _trailing_amounts(
    words: tuple[InterbankWord, ...],
) -> tuple[tuple[InterbankWord, ...], tuple[InterbankWord, ...]]:
    """Separa las palabras finales que son importes del texto que las precede."""

    cut = len(words)
    while cut > 0 and _is_money(words[cut - 1]):
        cut -= 1
    return words[:cut], words[cut:]


def _is_header(text: str) -> bool:
    return all(signal in text for signal in _HEADER_SIGNALS)


def _money(word: InterbankWord) -> Decimal:
    amount = parse_amount(word.text)
    if amount is None:  # pragma: no cover - `_MONEY` ya garantiza que se puede leer.
        raise ValueError("amount could not be parsed")
    return amount


class _Columns:
    """Centro horizontal de las columnas de importes, tomado de la cabecera."""

    def __init__(self) -> None:
        self.credit: Decimal | None = None
        self.debit: Decimal | None = None

    def learn(self, words: tuple[InterbankWord, ...]) -> None:
        for word in words:
            label = normalized_upper(word.text)
            if label == "INGRESOS":
                self.credit = word.center_x
            elif label == "GASTOS":
                self.debit = word.center_x

    def side_of(self, word: InterbankWord) -> str | None:
        if self.credit is None or self.debit is None:
            return None
        to_credit = abs(word.center_x - self.credit)
        to_debit = abs(word.center_x - self.debit)
        if to_credit == to_debit:
            return None
        return "credit" if to_credit < to_debit else "debit"


def _movement(
    words: tuple[InterbankWord, ...],
    *,
    page: int,
    posting_date: date,
    columns: _Columns,
) -> InterbankParsedRow | None:
    text_words, amounts = _trailing_amounts(words[1:])
    if len(amounts) != 2 or not text_words:
        return None

    amount_word, balance_word = amounts
    amount = _money(amount_word)
    if amount_word.text.startswith("+"):
        side: str | None = "credit"
    elif amount_word.text.startswith("-"):
        side = "debit"
    else:
        side = columns.side_of(amount_word)
    if side is None:
        return None

    magnitude = abs(amount)
    return InterbankParsedRow(
        row_type=InterbankRowType.MOVEMENT,
        page=page,
        description=" ".join(word.text for word in text_words),
        posting_date=posting_date,
        debit=magnitude if side == "debit" else None,
        credit=magnitude if side == "credit" else None,
        balance=_money(balance_word),
    )


def _closing(words: tuple[InterbankWord, ...], *, page: int) -> InterbankParsedRow | None:
    """`SALDO CONTABLE AL dd/mm +ingresos -gastos saldo`: los totales del documento."""

    _text, amounts = _trailing_amounts(words)
    if len(amounts) != 3:
        return None
    credits, debits, balance = amounts
    if credits.text.startswith("-") or debits.text.startswith("+"):
        return None
    return InterbankParsedRow(
        row_type=InterbankRowType.CLOSING_TOTALS,
        page=page,
        description="SALDO CONTABLE",
        credit=abs(_money(credits)),
        debit=abs(_money(debits)),
        balance=_money(balance),
    )


def _opening(words: tuple[InterbankWord, ...], *, page: int) -> InterbankParsedRow | None:
    _text, amounts = _trailing_amounts(words)
    if len(amounts) != 1:
        return None
    return InterbankParsedRow(
        row_type=InterbankRowType.OPENING_BALANCE,
        page=page,
        description="SALDO INICIAL",
        balance=_money(amounts[0]),
    )


def detect_currency(first_page_text: str) -> str | None:
    """La cuenta declara su moneda en el título: `CUENTA SIMPLE SOLES`."""

    text = normalized_upper(first_page_text)
    if re.search(r"\bCUENTA\b[A-Z ]*\bSOLES\b", text):
        return "PEN"
    if re.search(r"\bCUENTA\b[A-Z ]*\bDOLARES\b", text):
        return "USD"
    return None


def read_interbank_rows(
    pages: tuple[InterbankPageReadout, ...],
    *,
    first_page_text: str = "",
) -> InterbankDocumentRows:
    """Recorre las páginas en orden hasta el cierre del estado de cuenta.

    Todo lo que aparece después de la fila de cierre se ignora: es publicidad o la
    guía con su ejemplo inventado. En una página con cabecera, lo que está por encima
    de ella son datos del titular y no se interpreta.
    """

    rows: list[InterbankParsedRow] = []
    warnings: list[InterbankWarningCode] = []
    metrics: list[InterbankPageMetrics] = []
    columns = _Columns()
    closed = False

    for readout in pages:
        page_text = normalized_upper(" ".join(word.text for row in readout.rows for word in row))
        guide_page = _GUIDE_MARKER in page_text
        header_index = next(
            (
                index
                for index, row in enumerate(readout.rows)
                if _is_header(normalized_upper(" ".join(word.text for word in row)))
            ),
            None,
        )
        metrics.append(
            InterbankPageMetrics(
                page=readout.page,
                word_count=readout.word_count,
                row_count=len(readout.rows),
                header_detected=header_index is not None,
                guide_page=guide_page,
            )
        )
        if closed or guide_page:
            continue

        start = 0
        if header_index is not None:
            columns.learn(readout.rows[header_index])
            start = header_index + 1

        for raw_row in readout.rows[start:]:
            words = _merge_detached_signs(tuple(sorted(raw_row, key=lambda word: word.x0)))
            if not words:  # pragma: no cover - el lector no entrega filas vacías.
                continue
            text = normalized_upper(" ".join(word.text for word in words))
            has_money = any(_is_money(word) for word in words)

            if _is_header(text):
                columns.learn(words)
                continue

            parsed: InterbankParsedRow | None = None
            if text.startswith("SALDO CONTABLE AL"):
                parsed = _closing(words, page=readout.page)
            elif text.startswith("EMPEZASTE "):
                parsed = _opening(words, page=readout.page)
                if parsed is not None and any(
                    row.row_type is InterbankRowType.OPENING_BALANCE for row in rows
                ):
                    warnings.append(InterbankWarningCode.DUPLICATE_OPENING_BALANCE)
                    continue
            elif _FULL_DATE.match(words[0].text):
                posting_date = parse_statement_date(words[0].text)
                if posting_date is not None:
                    parsed = _movement(
                        words,
                        page=readout.page,
                        posting_date=posting_date,
                        columns=columns,
                    )
                    if parsed is None and len(_trailing_amounts(words[1:])[1]) == 2:
                        warnings.append(InterbankWarningCode.AMOUNT_SIDE_UNKNOWN)
                        continue

            if parsed is None:
                # Una fila solo de texto no mueve dinero: se ignora. Una con importes
                # que no se reconoce podría ser un movimiento perdido.
                if has_money and header_index is not None:
                    warnings.append(InterbankWarningCode.ROW_UNCLASSIFIED)
                continue

            rows.append(parsed)
            if parsed.row_type is InterbankRowType.CLOSING_TOTALS:
                closed = True
                break

    return InterbankDocumentRows(
        rows=tuple(rows),
        page_metrics=tuple(metrics),
        warning_codes=tuple(dict.fromkeys(warnings)),
        currency=detect_currency(first_page_text),
    )
