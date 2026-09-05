"""Orquestación pura del núcleo visual BCP."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from .continuations import merge_bcp_continuations
from .models import BcpParsedRow, BcpVisualRow, BcpWarningCode
from .row_parser import parse_bcp_visual_row
from .validation import BcpValidationReport, validate_bcp_rows


@dataclass(frozen=True, slots=True)
class BcpCoreResult:
    rows: tuple[BcpParsedRow, ...]
    validation: BcpValidationReport


def process_bcp_visual_rows(
    page_rows: Iterable[tuple[int, BcpVisualRow]],
    *,
    default_year: int | None,
) -> BcpCoreResult:
    parsed_rows: list[BcpParsedRow] = []
    warning_codes: list[BcpWarningCode] = []

    for page, visual_row in page_rows:
        parsed = parse_bcp_visual_row(
            visual_row,
            page=page,
            default_year=default_year,
        )
        warning_codes.extend(parsed.warning_codes)
        if parsed.row is not None:
            parsed_rows.append(parsed.row)

    merged = merge_bcp_continuations(tuple(parsed_rows))
    warning_codes.extend(merged.warning_codes)
    validation = validate_bcp_rows(
        merged.rows,
        upstream_warning_codes=warning_codes,
    )
    return BcpCoreResult(rows=merged.rows, validation=validation)
