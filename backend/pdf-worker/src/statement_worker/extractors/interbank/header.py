"""Cabecera de un estado de cuenta de ahorro de Interbank. Lectura pura.

La disposición es la del documento real con que se confirmó la plantilla, que
reproduce el sintético de las pruebas:

    [logo]                                         ESTADO DE CUENTA
                                                CUENTA SIMPLE SOLES   <- producto
                                                     <número>
                                     DEL <día> DE <mes> AL <día> DE <mes>
    <titular>
    DNI <número>
    Tu cuenta fue aperturada el dd/mm/aaaa
    DETALLE DE MOVIMIENTOS                          <- empieza el detalle

El bloque de la cuenta va alineado a la derecha y el del titular a la izquierda;
se separan por la mitad del ancho que ocupa el texto. Cada dato se reconoce por su
forma o su rótulo; uno ausente queda vacío. Sin el título no se lee nada.
"""

from __future__ import annotations

import re
from decimal import Decimal

from statement_worker.parsing.account_type import classify_account_type
from statement_worker.parsing.dates import parse_statement_date
from statement_worker.parsing.text import normalized_upper

from .models import InterbankStatementHeader, InterbankWord

_ACCOUNT_NUMBER = re.compile(r"^\d{3}-\d{7,13}$")
_PERIOD = re.compile(r"^DEL\s+.+\s+AL\s+.+$")
_IDENTITY_DOCUMENTS = frozenset({"DNI", "RUC", "CE", "PASAPORTE"})
_OPENED = re.compile(r"APERTURADA\s+EL\s+(\d{2}/\d{2}/\d{4})")
_CURRENCIES = frozenset({"SOLES", "DOLARES"})

Line = tuple[InterbankWord, ...]


def _token(word: InterbankWord) -> str:
    return re.sub(r"[^A-Z0-9]", "", normalized_upper(word.text))


def _join(words: list[InterbankWord] | Line) -> str:
    return " ".join(word.text for word in words).strip()


def _has(line: Line, *tokens: str) -> bool:
    present = {_token(word) for word in line}
    return all(token in present for token in tokens)


def read_interbank_header(rows: tuple[Line, ...]) -> InterbankStatementHeader:
    """Lee la cabecera de las filas de la primera página; lo ausente queda vacío."""

    end = next(
        (
            index
            for index, line in enumerate(rows)
            if _has(line, "DETALLE", "MOVIMIENTOS") or _has(line, "FECHA", "CONCEPTO")
        ),
        len(rows),
    )
    lines = rows[:end]
    title_index = next(
        (index for index, line in enumerate(lines) if _has(line, "ESTADO", "CUENTA")), None
    )
    if title_index is None:
        return InterbankStatementHeader()

    middle = max(word.x1 for line in lines for word in line) / Decimal("2")
    right: list[list[InterbankWord]] = []
    left: list[list[InterbankWord]] = []
    for line in lines[title_index + 1 :]:
        if right_words := [word for word in line if word.x0 >= middle]:
            right.append(right_words)
        if left_words := [word for word in line if word.x0 < middle]:
            left.append(left_words)

    account_number = next(
        (word.text for line in right for word in line if _ACCOUNT_NUMBER.match(word.text)), ""
    )
    period = next(
        (_join(line) for line in right if _PERIOD.match(normalized_upper(_join(line)))), ""
    )
    product = next(
        (
            _join(line)
            for line in right
            if _join(line) != period and not any(_ACCOUNT_NUMBER.match(w.text) for w in line)
        ),
        "",
    )
    currency = next(
        (
            word.text
            for line in right
            if _join(line) == product
            for word in line
            if _token(word) in _CURRENCIES
        ),
        "",
    )

    document_index = next(
        (index for index, line in enumerate(left) if _token(line[0]) in _IDENTITY_DOCUMENTS),
        None,
    )
    if document_index is not None:
        holder = _join(left[document_index - 1]) if document_index > 0 else ""
        identity_document = _join(left[document_index])
    else:
        holder = _join(left[0]) if left else ""
        identity_document = ""
    opened = _OPENED.search(normalized_upper(" ".join(_join(line) for line in left)))

    return InterbankStatementHeader(
        account_product=product,
        account_type=classify_account_type(product, bank="interbank"),
        holder=holder,
        identity_document=identity_document,
        account_number=account_number,
        currency_label=currency,
        period=period,
        opened_on=parse_statement_date(opened.group(1)) if opened else None,
    )
