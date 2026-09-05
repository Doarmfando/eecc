"""Clasificación de filas visuales BCP sin dependencias de PDF."""

from __future__ import annotations

from decimal import Decimal

from statement_worker.parsing.amounts import parse_amount
from statement_worker.parsing.dates import parse_statement_date
from statement_worker.parsing.text import normalize_spaces, normalized_upper

from .layout import classify_bcp_column
from .models import (
    BcpColumn,
    BcpParsedRow,
    BcpRowParseResult,
    BcpRowType,
    BcpVisualRow,
    BcpWarningCode,
)

_COLUMN_ORDER = (
    BcpColumn.POSTING_DATE,
    BcpColumn.VALUE_DATE,
    BcpColumn.DESCRIPTION,
    BcpColumn.DEBIT,
    BcpColumn.CREDIT,
)

_NOISE_PATTERNS = (
    "FECHA PROC",
    "FECHA VALOR",
    "DESCRIPCION",
    "CARGOS / DEBE",
    "ABONOS / HABER",
    "ADVERTENCIA",
    "MENSAJE AL CLIENTE",
    "DEFENSOR DEL CLIENTE",
    "INDECOPI",
    "OFICINAS",
    "311-9898",
    "ESTADO DE CUENTA",
    "CODIGO DE CUENTA",
    "MONEDA",
    "PAGINA",
)


def is_bcp_noise(text: str) -> bool:
    normalized = normalized_upper(text)
    return any(pattern in normalized for pattern in _NOISE_PATTERNS)


def _join(values: list[str]) -> str:
    return normalize_spaces(" ".join(values))


def _parse_column_amount(
    raw: str,
    warning_codes: list[BcpWarningCode],
) -> Decimal | None:
    if not raw:
        return None
    amount = parse_amount(raw)
    if amount is None:
        warning_codes.append(BcpWarningCode.AMOUNT_UNPARSEABLE)
    elif amount < 0:
        warning_codes.append(BcpWarningCode.NEGATIVE_COLUMN_AMOUNT)
    return amount


def parse_bcp_visual_row(
    visual_row: BcpVisualRow,
    *,
    page: int,
    default_year: int | None,
) -> BcpRowParseResult:
    if page < 1:
        raise ValueError("page must be positive")

    columns: dict[BcpColumn, list[str]] = {column: [] for column in _COLUMN_ORDER}
    for word in visual_row.words:
        text = normalize_spaces(word.text)
        if not text:
            continue
        column = classify_bcp_column(word.center_x)
        if column in columns:
            columns[column].append(text)

    values = {column: _join(columns[column]) for column in _COLUMN_ORDER}
    full_text = _join([values[column] for column in _COLUMN_ORDER])
    if not full_text or is_bcp_noise(full_text):
        return BcpRowParseResult(row=None)

    posting_text = values[BcpColumn.POSTING_DATE]
    value_text = values[BcpColumn.VALUE_DATE]
    description = values[BcpColumn.DESCRIPTION]
    debit_text = values[BcpColumn.DEBIT]
    credit_text = values[BcpColumn.CREDIT]
    normalized = normalized_upper(full_text)
    warning_codes: list[BcpWarningCode] = []

    debit = _parse_column_amount(debit_text, warning_codes)
    credit = _parse_column_amount(credit_text, warning_codes)
    has_debit_and_credit = debit not in (None, Decimal("0")) and credit not in (None, Decimal("0"))

    if "SALDO ANTERIOR" in normalized:
        if has_debit_and_credit:
            warning_codes.append(BcpWarningCode.BALANCE_AMOUNT_CONFLICT)
        return BcpRowParseResult(
            row=BcpParsedRow(
                row_type=BcpRowType.PREVIOUS_BALANCE,
                page=page,
                description="SALDO ANTERIOR",
                balance=credit if credit is not None else debit,
            ),
            warning_codes=tuple(warning_codes),
        )

    if "TOTAL MOVIMIENTO" in normalized or "TOTAL MOVIMIENTOS" in normalized:
        return BcpRowParseResult(
            row=BcpParsedRow(
                row_type=BcpRowType.MOVEMENT_TOTAL,
                page=page,
                description="TOTAL MOVIMIENTO",
                debit=debit,
                credit=credit,
            ),
            warning_codes=tuple(warning_codes),
        )

    if normalized == "SALDO" or normalized.startswith("SALDO "):
        if has_debit_and_credit:
            warning_codes.append(BcpWarningCode.BALANCE_AMOUNT_CONFLICT)
        return BcpRowParseResult(
            row=BcpParsedRow(
                row_type=BcpRowType.BALANCE,
                page=page,
                description="SALDO",
                balance=credit if credit is not None else debit,
            ),
            warning_codes=tuple(warning_codes),
        )

    posting_date = parse_statement_date(posting_text, default_year=default_year)
    value_date = parse_statement_date(value_text, default_year=default_year)
    date_text_present = bool(posting_text or value_text)
    if has_debit_and_credit:
        warning_codes.append(BcpWarningCode.BOTH_DEBIT_AND_CREDIT)

    if posting_date is not None and value_date is not None:
        return BcpRowParseResult(
            row=BcpParsedRow(
                row_type=BcpRowType.MOVEMENT,
                page=page,
                description=description,
                posting_date=posting_date,
                value_date=value_date,
                debit=debit,
                credit=credit,
            ),
            warning_codes=tuple(warning_codes),
        )

    if not date_text_present and description:
        return BcpRowParseResult(
            row=BcpParsedRow(
                row_type=BcpRowType.CONTINUATION,
                page=page,
                description=description,
                debit=debit,
                credit=credit,
            ),
            warning_codes=tuple(warning_codes),
        )

    if date_text_present:
        warning_codes.append(BcpWarningCode.DATE_UNPARSEABLE)
    warning_codes.append(BcpWarningCode.ROW_UNCLASSIFIED)
    return BcpRowParseResult(
        row=BcpParsedRow(
            row_type=BcpRowType.UNCLASSIFIED,
            page=page,
            description=description,
            debit=debit,
            credit=credit,
        ),
        warning_codes=tuple(warning_codes),
    )
