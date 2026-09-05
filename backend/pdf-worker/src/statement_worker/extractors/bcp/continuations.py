"""Unión conservadora de continuaciones BCP."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

from statement_worker.parsing.text import normalize_spaces

from .models import (
    BcpContinuationMergeResult,
    BcpParsedRow,
    BcpRowType,
    BcpWarningCode,
)


def _merge_amount(
    previous: Decimal | None,
    continuation: Decimal | None,
    warning_codes: list[BcpWarningCode],
) -> Decimal | None:
    if previous is None:
        return continuation
    if continuation is not None and continuation != previous:
        warning_codes.append(BcpWarningCode.CONTINUATION_AMOUNT_CONFLICT)
    return previous


def merge_bcp_continuations(rows: tuple[BcpParsedRow, ...]) -> BcpContinuationMergeResult:
    merged: list[BcpParsedRow] = []
    warning_codes: list[BcpWarningCode] = []

    for row in rows:
        if row.row_type is not BcpRowType.CONTINUATION:
            merged.append(row)
            continue

        if not merged or merged[-1].row_type is not BcpRowType.MOVEMENT:
            merged.append(row)
            warning_codes.append(BcpWarningCode.ORPHAN_CONTINUATION)
            continue

        previous = merged[-1]
        if previous.page != row.page:
            merged.append(row)
            warning_codes.append(BcpWarningCode.CROSS_PAGE_CONTINUATION)
            continue

        description = previous.description
        if row.description:
            description = normalize_spaces(f"{previous.description} | {row.description}")
        merged[-1] = replace(
            previous,
            description=description,
            debit=_merge_amount(previous.debit, row.debit, warning_codes),
            credit=_merge_amount(previous.credit, row.credit, warning_codes),
            balance=_merge_amount(previous.balance, row.balance, warning_codes),
        )

    return BcpContinuationMergeResult(
        rows=tuple(merged),
        warning_codes=tuple(warning_codes),
    )
