"""Cabecera y pie de un estado de cuenta del BBVA. Lectura pura, sin reglas de saldo.

Medido sobre documentos reales de cuenta corriente en soles y en dólares y de
ahorro en soles; los tres comparten la disposición:

    MOVIMIENTO Y SALDO A LA FECHA
    CUENTA CORRIENTE                            <- producto
    TITULARES:
    <titular>
    <dirección, en varias líneas>               SU EJECUTIVO DE CUENTA ES:
    PERU <código>                               <ejecutivo>
    MONEDA: DOLARES US     RUC <número>
    [tabla de movimientos]
    CODIGO CUENTA INTERBANCARIA (CCI)   BANCA POR TELEFONO ...
    <cci en cuatro grupos>              BANCA POR INTERNET ...
    OFICINA      FECHA        CODIGO DE CUENTA                 HOJA
    <oficina>    dd-mm-aaaa   ENTIDAD OFICINA CUENTA D.C.      <n>
                              <entidad> <oficina> <cuenta> <dc>

El ejecutivo comparte líneas con la dirección, a unos tres puntos de altura: según
la fuente caen en la misma fila visual o en filas distintas. Por eso la columna se
decide por la mitad de la página y no por el orden de las palabras. Cada dato se
busca por su rótulo; uno ausente queda vacío.
"""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal

from statement_worker.parsing.account_type import classify_account_type
from statement_worker.parsing.text import normalized_upper

from .models import BbvaPageReadout, BbvaStatementHeader, BbvaWord

# Sin ancho de página, el de un A4 vertical: es el formato de todas las muestras.
_DEFAULT_PAGE_WIDTH = Decimal("595")
_FULL_DATE = re.compile(r"^(\d{1,2})-(\d{1,2})-(\d{4})$")
_DIGITS = re.compile(r"^\d+$")
_TAX_ID = re.compile(r"^RUC(\d*)$")
# El rótulo de la hoja va alineado a la izquierda de su número, que cae unos
# puntos a la derecha; la tolerancia no alcanza a `D.C.`, cincuenta puntos antes.
_SHEET_TOLERANCE = Decimal("10")


def _label(word: BbvaWord) -> str:
    return re.sub(r"[^A-Z0-9/]", "", normalized_upper(word.text))


def _labels(words: tuple[BbvaWord, ...]) -> list[str]:
    return [_label(word) for word in words]


def _join(words: list[BbvaWord] | tuple[BbvaWord, ...]) -> str:
    return " ".join(word.text for word in words).strip()


def _find(rows: tuple[tuple[BbvaWord, ...], ...], *labels: str, start: int = 0) -> int | None:
    """Primera fila, desde `start`, que contiene todos los rótulos."""

    for index in range(start, len(rows)):
        present = set(_labels(rows[index]))
        if all(label in present for label in labels):
            return index
    return None


def _sheet_number(rows: tuple[tuple[BbvaWord, ...], ...]) -> int | None:
    labels_index = _find(rows, "OFICINA", "HOJA")
    if labels_index is None or labels_index + 1 >= len(rows):
        return None
    sheet_label = next(word for word in rows[labels_index] if _label(word) == "HOJA")
    values = [
        word.text
        for word in rows[labels_index + 1]
        if word.x0 >= sheet_label.x0 - _SHEET_TOLERANCE and _DIGITS.match(word.text)
    ]
    return int(values[0]) if values else None


def _sheets(pages: tuple[BbvaPageReadout, ...]) -> str:
    numbers = [number for page in pages if (number := _sheet_number(page.rows)) is not None]
    if not numbers:
        return ""
    first, last = numbers[0], numbers[-1]
    return str(first) if first == last else f"{first}-{last}"


def _currency_and_tax_id(words: tuple[BbvaWord, ...]) -> tuple[str, str]:
    """`MONEDA: DOLARES US   RUC 20000000001` -> (`DOLARES US`, `20000000001`).

    Con poca separación el lector une el rótulo y el número (`RUC20000000001`).
    """

    labels = _labels(words)
    start = labels.index("MONEDA") + 1
    tax_index = next(
        (index for index, label in enumerate(labels) if _TAX_ID.match(label)), len(words)
    )
    currency = [word for word in words[start:tax_index] if _label(word)]
    if tax_index == len(words):
        return _join(currency), ""
    glued = _TAX_ID.match(labels[tax_index])
    following = [word.text for word in words[tax_index + 1 :] if _label(word)]
    tax_id = (glued.group(1) if glued else "") or (following[0] if following else "")
    return _join(currency), tax_id


def _footer(
    rows: tuple[tuple[BbvaWord, ...], ...],
) -> tuple[str, date | None, str, str]:
    """(oficina, fecha, código de cuenta, cci) del pie de la página."""

    office, statement_date, account_code, interbank_code = "", None, "", ""

    cci_label = _find(rows, "INTERBANCARIA")
    if cci_label is not None and cci_label + 1 < len(rows):
        groups: list[BbvaWord] = []
        for word in rows[cci_label + 1]:
            if not _DIGITS.match(word.text):
                break
            groups.append(word)
        interbank_code = _join(groups)

    labels_index = _find(rows, "OFICINA", "HOJA")
    if labels_index is not None and labels_index + 1 < len(rows):
        values = rows[labels_index + 1]
        dated = next(
            (
                (index, match)
                for index, word in enumerate(values)
                if (match := _FULL_DATE.match(word.text))
            ),
            None,
        )
        if dated is not None:
            position, match = dated
            office = _join(values[:position])
            day, month, year = (int(group) for group in match.groups())
            try:
                statement_date = date(year, month, day)
            except ValueError:
                statement_date = None
        if labels_index + 2 < len(rows):
            code = rows[labels_index + 2]
            if code and all(_DIGITS.match(word.text) for word in code):
                account_code = _join(code)

    return office, statement_date, account_code, interbank_code


def read_bbva_header(
    pages: tuple[BbvaPageReadout, ...],
    *,
    page_width: Decimal | None = None,
) -> BbvaStatementHeader:
    """Lee los datos de la cuenta de la primera página y el correlativo de todas."""

    if not pages:
        return BbvaStatementHeader()

    rows = pages[0].rows
    split = (page_width or _DEFAULT_PAGE_WIDTH) / Decimal("2")

    def left(index: int) -> list[BbvaWord]:
        return [word for word in rows[index] if word.x0 < split]

    def right(index: int) -> list[BbvaWord]:
        return [word for word in rows[index] if word.x0 >= split]

    table = _find(rows, "CARGO/ABONO")
    header_end = table if table is not None else len(rows)
    holders = _find(rows, "TITULARES")
    if holders is None:
        holders = _find(rows, "TITULAR")
    currency_row = _find(rows, "MONEDA")
    if currency_row is not None and currency_row >= header_end:
        currency_row = None
    block_end = currency_row if currency_row is not None else header_end

    product = ""
    holder = ""
    address = ""
    manager = ""
    if holders is not None and holders < block_end:
        if holders > 0 and "MOVIMIENTO" not in _labels(rows[holders - 1]):
            product = _join(left(holders - 1))
        # El titular puede ir en la línea del rótulo o en la siguiente.
        after_label = [
            word for word in left(holders) if _label(word) not in {"TITULARES", "TITULAR", ""}
        ]
        if after_label:
            holder, address_start = _join(after_label), holders + 1
        elif holders + 1 < block_end:
            holder, address_start = _join(left(holders + 1)), holders + 2
        else:
            address_start = block_end
        address = ", ".join(
            text for index in range(address_start, block_end) if (text := _join(left(index)))
        )

        manager_label = next(
            (
                index
                for index in range(holders, block_end)
                if "EJECUTIVO" in _labels(tuple(right(index)))
            ),
            None,
        )
        if manager_label is not None:
            manager = " ".join(
                text
                for index in range(manager_label + 1, block_end)
                if (text := _join(right(index)))
            )

    currency_label, tax_id = (
        _currency_and_tax_id(rows[currency_row]) if currency_row is not None else ("", "")
    )
    office, statement_date, account_code, interbank_code = _footer(rows)

    return BbvaStatementHeader(
        account_product=product,
        account_type=classify_account_type(product),
        holder=holder,
        address=address,
        currency_label=currency_label,
        tax_id=tax_id,
        account_manager=manager,
        interbank_code=interbank_code,
        office=office,
        statement_date=statement_date,
        account_code=account_code,
        sheets=_sheets(pages),
    )
