"""Cabecera de un estado de cuenta del Banco de la Nación. Lectura pura, sin reglas de saldo.

Medida sobre un documento real de cuenta corriente, que la repite en cada página:

    <titular>                                   ESTADO DE CTA CTE AL :
    <dirección>                                             dd/mm/aaaa
                                                          Página : 1
    CODIGO DE CLIENTE : <código>
    NOMBRE DE CUENTA : <nombre>
    NUMERO DE CUENTA : <número>         Fecha de Impresion :dd/mm/aaaa hh:mm:ss
    CODIFICACION   CARGOS   ABONOS   SALDOS   DIA      <- empieza la tabla

El titular comparte la línea con el título y la dirección con la fecha del estado,
así que se separan por posición: lo que empieza antes que `ESTADO` es del bloque
izquierdo. Cada dato rotulado se lee tras su rótulo. El documento no declara la
moneda en ninguna página: no se deduce. Sin el título no se lee nada.
"""

from __future__ import annotations

import re

from statement_worker.parsing.account_type import classify_account_type
from statement_worker.parsing.dates import parse_statement_date
from statement_worker.parsing.text import normalized_upper

from .models import BancoNacionStatementHeader, BancoNacionWord

_FULL_DATE = re.compile(r"^\d{1,2}/\d{1,2}/\d{4}$")
_LABELS = (
    ("CODIGO", "DE", "CLIENTE"),
    ("NOMBRE", "DE", "CUENTA"),
    ("NUMERO", "DE", "CUENTA"),
)

Line = tuple[BancoNacionWord, ...]


def _token(word: BancoNacionWord) -> str:
    return re.sub(r"[^A-Z0-9/]", "", normalized_upper(word.text))


def _join(words: list[BancoNacionWord] | Line) -> str:
    return " ".join(word.text for word in words).strip()


def _find(line: Line, labels: tuple[str, ...]) -> int | None:
    tokens = [_token(word) for word in line]
    for index in range(len(tokens) - len(labels) + 1):
        if tuple(tokens[index : index + len(labels)]) == labels:
            return index
    return None


def _value_after(lines: list[Line], labels: tuple[str, ...], *, stop: str = "") -> str:
    """El texto que sigue al rótulo y su `:` en la misma línea, hasta `stop`."""

    for line in lines:
        index = _find(line, labels)
        if index is None:
            continue
        values: list[str] = []
        for word in line[index + len(labels) :]:
            if stop and _token(word) == stop:
                break
            text = word.text.lstrip(":").strip()
            if text:
                values.append(text)
        return " ".join(values)
    return ""


def read_banco_nacion_header(rows: tuple[Line, ...]) -> BancoNacionStatementHeader:
    """Lee la cabecera de las filas de la primera página; lo ausente queda vacío."""

    end = next(
        (
            index
            for index, line in enumerate(rows)
            if {"CARGOS", "ABONOS"} <= {_token(word) for word in line}
        ),
        len(rows),
    )
    lines = list(rows[:end])
    found = next(
        (
            (index, start)
            for index, line in enumerate(lines)
            if (start := _find(line, ("ESTADO", "DE"))) is not None
        ),
        None,
    )
    if found is None:
        return BancoNacionStatementHeader()

    title_index, start = found
    title = lines[title_index]
    estado = title[start]
    holder = _join([word for word in title if word.x0 < estado.x0])
    product_words: list[BancoNacionWord] = []
    for word in title[start + 2 :]:
        if _token(word) == "AL":
            break
        product_words.append(word)
    product = _join(product_words)

    after_title = lines[title_index + 1 :]
    first_label = next(
        (
            index
            for index, line in enumerate(after_title)
            if any(_find(line, labels) is not None for labels in _LABELS)
        ),
        len(after_title),
    )
    # Entre el título y el primer rótulo, a la izquierda, solo va la dirección.
    address = " ".join(
        _join(left)
        for line in after_title[:first_label]
        if (left := [word for word in line if word.x0 < estado.x0])
    )
    statement_date = next(
        (
            parse_statement_date(word.text)
            for line in after_title[:first_label]
            for word in line
            if word.x0 >= estado.x0 and _FULL_DATE.match(word.text)
        ),
        None,
    )
    page = _value_after(lines, ("PAGINA",))

    return BancoNacionStatementHeader(
        account_product=product,
        account_type=classify_account_type(product, bank="banco_nacion"),
        holder=holder,
        address=address,
        client_code=_value_after(lines, ("CODIGO", "DE", "CLIENTE")),
        account_name=_value_after(lines, ("NOMBRE", "DE", "CUENTA")),
        account_number=_value_after(lines, ("NUMERO", "DE", "CUENTA"), stop="FECHA"),
        statement_date=statement_date,
        printed_at=_value_after(lines, ("FECHA", "DE", "IMPRESION")),
        first_page=int(page) if page.isdigit() else None,
    )
