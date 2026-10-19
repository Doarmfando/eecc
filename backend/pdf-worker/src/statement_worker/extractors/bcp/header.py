"""Cabecera de un estado de cuenta BCP. Lectura pura, sin reglas de saldo.

Medido sobre dos documentos reales de ahorro en soles, con esta disposición:

    Estado de Cuenta de Ahorros CLASICA               PAGINA 1 DE 457
    <titular>                                    CODIGO DE CUENTA      MONEDA
                                               <código de cuenta>      SOLES
    <dirección, en varias líneas>
    <provincia> (<código>)<n>                    FECHA DE ESTADO DE CUENTA
          <n>                                    DEL dd/mm/aa AL dd/mm/aa
    FECHA PROC. FECHA VALOR DESCRIPCION ...      <- empieza la tabla

El titular comparte la línea con los rótulos de la derecha, así que las dos
columnas se separan por posición. El bloque derecho empieza unos puntos antes que
sus rótulos —el código de cuenta va más a la izquierda que `CODIGO`—, por eso el
corte lo marca el dato más a la izquierda que se reconoce por su forma: el código
de cuenta, una fecha del periodo o un rótulo. Cada dato se busca por su forma o su
rótulo; uno ausente queda vacío. La lectura empieza en el título: lo que vaya
encima, o una página sin él, no se interpreta.
"""

from __future__ import annotations

import re
from decimal import Decimal

from statement_worker.parsing.account_type import classify_account_type
from statement_worker.parsing.dates import parse_statement_date
from statement_worker.parsing.text import normalized_upper

from .models import BcpStatementHeader, PdfWord

# Las filas de la cabecera están a 11-14 puntos; un rótulo y el dato de su misma
# línea, a 2-3. Así se une lo que va en la misma línea sin juntar dos líneas.
_LINE_TOLERANCE = Decimal("4")
_ACCOUNT_CODE = re.compile(r"^\d{3}-\d{7,8}-\d-\d{2}$")
_SHORT_DATE = re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}$")
_PERIOD = re.compile(r"\bDEL\s+(\d{1,2}/\d{1,2}/\d{2,4})\s+AL\s+(\d{1,2}/\d{1,2}/\d{2,4})\b")
_PAGE = re.compile(r"\bPAGINA\s+(\d+)\s+DE\s+(\d+)\b")
_RIGHT_LABELS = frozenset({"CODIGO", "MONEDA", "PAGINA"})
_CURRENCIES = frozenset({"SOLES", "DOLARES"})
_TITLE_PREFIX = re.compile(r"^ESTADO\s+DE\s+(?=CUENTA\b)")
# Líneas del bloque izquierdo que solo traen una cifra (un correlativo de envío).
_ONLY_NUMBER = re.compile(r"^[\d.,\s]+$")


def _label(word: PdfWord) -> str:
    return re.sub(r"[^A-Z0-9/-]", "", normalized_upper(word.text))


def _join(words: list[PdfWord]) -> str:
    return " ".join(word.text for word in words).strip()


def _lines(words: tuple[PdfWord, ...]) -> list[list[PdfWord]]:
    """Las líneas desde el título hasta la cabecera de la tabla, sin incluirla.

    Sin el título «Estado de Cuenta …» no se devuelve nada: con otra disposición,
    la primera línea podría tomarse por el titular.
    """

    lines: list[list[PdfWord]] = []
    anchor: Decimal | None = None
    for word in sorted(words, key=lambda item: (item.top, item.x0)):
        if anchor is None or word.top - anchor > _LINE_TOLERANCE:
            lines.append([])
            anchor = word.top
        lines[-1].append(word)
    ordered = [sorted(line, key=lambda word: word.x0) for line in lines]
    start = next(
        (
            index
            for index, line in enumerate(ordered)
            if _TITLE_PREFIX.match(normalized_upper(_join(line)))
        ),
        None,
    )
    if start is None:
        return []
    end = next(
        (
            index
            for index in range(start, len(ordered))
            if any(_label(word) == "DESCRIPCION" for word in ordered[index])
        ),
        len(ordered),
    )
    return ordered[start:end]


def _right_column_start(words: list[PdfWord]) -> Decimal | None:
    markers = [
        word.x0
        for word in words
        if _label(word) in _RIGHT_LABELS
        or _ACCOUNT_CODE.match(word.text)
        or _SHORT_DATE.match(word.text)
    ]
    return min(markers) if markers else None


def read_bcp_header(words: tuple[PdfWord, ...]) -> BcpStatementHeader:
    """Lee la cabecera de la primera página; lo que no encuentra queda vacío."""

    lines = _lines(words)
    if not lines:
        return BcpStatementHeader()
    split = _right_column_start([word for line in lines for word in line])
    left: list[list[PdfWord]] = []
    right: list[PdfWord] = []
    for line in lines:
        left_words = [word for word in line if split is None or word.x0 < split]
        right.extend(word for word in line if split is not None and word.x0 >= split)
        if left_words:
            left.append(left_words)

    # «Estado de Cuenta de Ahorros CLASICA» -> «Cuenta de Ahorros CLASICA».
    title = left.pop(0)
    product = _join(title[2:])
    holder = _join(left[0]) if left else ""
    address = " ".join(_join(line) for line in left[1:] if not _ONLY_NUMBER.match(_join(line)))

    right_text = normalized_upper(_join(right))
    period = _PERIOD.search(right_text)
    page = _PAGE.search(right_text)
    account_code = next((word.text for word in right if _ACCOUNT_CODE.match(word.text)), "")
    currency = next((word.text for word in right if _label(word) in _CURRENCIES), "")

    return BcpStatementHeader(
        account_product=product,
        account_type=classify_account_type(product),
        holder=holder,
        address=address,
        account_code=account_code,
        currency_label=currency,
        period=f"DEL {period.group(1)} AL {period.group(2)}" if period else "",
        period_start=parse_statement_date(period.group(1)) if period else None,
        period_end=parse_statement_date(period.group(2)) if period else None,
        first_page=int(page.group(1)) if page else None,
        declared_pages=int(page.group(2)) if page else None,
    )
