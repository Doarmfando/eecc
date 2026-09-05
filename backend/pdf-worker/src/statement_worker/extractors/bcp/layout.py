"""Reglas puras para reconstruir el layout visual BCP."""

from __future__ import annotations

from collections.abc import Iterable
from decimal import Decimal

from statement_worker.parsing.text import normalized_upper

from .models import BcpColumn, BcpTableBounds, BcpVisualRow, PdfWord

DEFAULT_ROW_TOLERANCE = Decimal("2.8")

# En los estados de cuenta reales las filas de movimiento están a 11.2-11.4 puntos,
# mientras que una etiqueta de pie ("TOTAL MOVIMIENTO", "SALDO") y sus importes
# quedan a 5.2-6.7. No hay separaciones intermedias, así que este umbral une la
# etiqueta con sus importes sin fusionar jamás dos movimientos.
FOOTER_AWARE_ROW_TOLERANCE = Decimal("8")
DEFAULT_TABLE_TOP = Decimal("205")
DEFAULT_TABLE_BOTTOM = Decimal("720")

_HEADER_TOKENS = {"PROC.", "VALOR", "DESCRIPCION", "CARGOS", "DEBE", "ABONOS", "HABER"}


def group_words_by_row(
    words: Iterable[PdfWord],
    *,
    tolerance_y: Decimal = DEFAULT_ROW_TOLERANCE,
) -> tuple[BcpVisualRow, ...]:
    """Agrupa palabras cercanas verticalmente sin encadenar filas distintas."""

    if tolerance_y < 0:
        raise ValueError("tolerance_y must be non-negative")

    ordered = sorted(words, key=lambda word: (word.top, word.x0))
    grouped: list[list[PdfWord]] = []
    anchors: list[Decimal] = []

    for word in ordered:
        if not grouped or abs(word.top - anchors[-1]) > tolerance_y:
            grouped.append([word])
            anchors.append(word.top)
        else:
            grouped[-1].append(word)

    return tuple(
        BcpVisualRow(top=anchor, words=tuple(sorted(row_words, key=lambda word: word.x0)))
        for anchor, row_words in zip(anchors, grouped, strict=True)
    )


def classify_bcp_column(center_x: Decimal) -> BcpColumn:
    if Decimal("30") <= center_x < Decimal("78"):
        return BcpColumn.POSTING_DATE
    if Decimal("78") <= center_x < Decimal("120"):
        return BcpColumn.VALUE_DATE
    if Decimal("120") <= center_x < Decimal("330"):
        return BcpColumn.DESCRIPTION
    if Decimal("330") <= center_x < Decimal("455"):
        return BcpColumn.DEBIT
    if Decimal("455") <= center_x < Decimal("570"):
        return BcpColumn.CREDIT
    return BcpColumn.OUTSIDE


def detect_bcp_table_bounds(words: Iterable[PdfWord]) -> BcpTableBounds:
    header_tops: list[Decimal] = []
    footer_tops: list[Decimal] = []

    for word in words:
        text = normalized_upper(word.text)
        if text in _HEADER_TOKENS and Decimal("150") <= word.top <= Decimal("360"):
            header_tops.append(word.top)
        if (text.startswith("ADVERTENCIA") or text == "MENSAJE") and word.top > Decimal("300"):
            footer_tops.append(word.top)

    top = max(header_tops) + Decimal("8") if header_tops else DEFAULT_TABLE_TOP
    candidate_bottom = min(footer_tops) - Decimal("4") if footer_tops else DEFAULT_TABLE_BOTTOM
    footer_detected = bool(footer_tops) and candidate_bottom > top
    bottom = candidate_bottom if footer_detected else DEFAULT_TABLE_BOTTOM

    if bottom <= top:
        top = DEFAULT_TABLE_TOP
        bottom = DEFAULT_TABLE_BOTTOM
        return BcpTableBounds(top=top, bottom=bottom)

    return BcpTableBounds(
        top=top,
        bottom=bottom,
        header_detected=bool(header_tops),
        footer_detected=footer_detected,
    )


def words_inside_bounds(
    words: Iterable[PdfWord],
    bounds: BcpTableBounds,
) -> tuple[PdfWord, ...]:
    return tuple(word for word in words if bounds.top <= word.top <= bounds.bottom)
