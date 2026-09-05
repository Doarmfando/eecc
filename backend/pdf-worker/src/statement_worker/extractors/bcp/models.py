"""Modelos internos de la extracción visual BCP."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from enum import StrEnum

from statement_worker.domain.models import DocumentProbe


class BcpColumn(StrEnum):
    POSTING_DATE = "POSTING_DATE"
    VALUE_DATE = "VALUE_DATE"
    DESCRIPTION = "DESCRIPTION"
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"
    OUTSIDE = "OUTSIDE"


class BcpRowType(StrEnum):
    MOVEMENT = "MOVEMENT"
    PREVIOUS_BALANCE = "PREVIOUS_BALANCE"
    MOVEMENT_TOTAL = "MOVEMENT_TOTAL"
    BALANCE = "BALANCE"
    CONTINUATION = "CONTINUATION"
    UNCLASSIFIED = "UNCLASSIFIED"


class BcpWarningCode(StrEnum):
    AMOUNT_UNPARSEABLE = "BCP_AMOUNT_UNPARSEABLE"
    NEGATIVE_COLUMN_AMOUNT = "BCP_NEGATIVE_COLUMN_AMOUNT"
    BOTH_DEBIT_AND_CREDIT = "BCP_BOTH_DEBIT_AND_CREDIT"
    BALANCE_AMOUNT_CONFLICT = "BCP_BALANCE_AMOUNT_CONFLICT"
    DATE_UNPARSEABLE = "BCP_DATE_UNPARSEABLE"
    ROW_UNCLASSIFIED = "BCP_ROW_UNCLASSIFIED"
    ORPHAN_CONTINUATION = "BCP_ORPHAN_CONTINUATION"
    CROSS_PAGE_CONTINUATION = "BCP_CROSS_PAGE_CONTINUATION"
    CONTINUATION_AMOUNT_CONFLICT = "BCP_CONTINUATION_AMOUNT_CONFLICT"
    NO_ROWS = "BCP_NO_ROWS"
    UNCLASSIFIED_ROWS_PRESENT = "BCP_UNCLASSIFIED_ROWS_PRESENT"
    UNMERGED_CONTINUATIONS_PRESENT = "BCP_UNMERGED_CONTINUATIONS_PRESENT"
    INVALID_MOVEMENT_FIELDS = "BCP_INVALID_MOVEMENT_FIELDS"
    INVALID_MOVEMENT_AMOUNT = "BCP_INVALID_MOVEMENT_AMOUNT"
    DUPLICATE_PAGE_TOTAL = "BCP_DUPLICATE_PAGE_TOTAL"
    DECLARED_TOTAL_MISMATCH = "BCP_DECLARED_TOTAL_MISMATCH"
    BALANCE_RECONCILIATION_INCOMPLETE = "BCP_BALANCE_RECONCILIATION_INCOMPLETE"
    BALANCE_MISMATCH = "BCP_BALANCE_MISMATCH"


def _as_decimal(value: object, *, field_name: str) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (Decimal, int, float, str)):
        raise ValueError(f"{field_name} must be numeric")
    try:
        return Decimal(str(value))
    except InvalidOperation as error:
        raise ValueError(f"{field_name} must be numeric") from error


@dataclass(frozen=True, slots=True)
class PdfWord:
    text: str
    x0: Decimal
    x1: Decimal
    top: Decimal

    def __post_init__(self) -> None:
        if self.x0 < 0 or self.top < 0:
            raise ValueError("word coordinates must be non-negative")
        if self.x1 < self.x0:
            raise ValueError("x1 must be greater than or equal to x0")

    @property
    def center_x(self) -> Decimal:
        return (self.x0 + self.x1) / Decimal("2")

    @classmethod
    def from_mapping(cls, value: Mapping[str, object]) -> PdfWord:
        text = value.get("text", "")
        if not isinstance(text, str):
            raise ValueError("text must be a string")
        return cls(
            text=text,
            x0=_as_decimal(value.get("x0"), field_name="x0"),
            x1=_as_decimal(value.get("x1"), field_name="x1"),
            top=_as_decimal(value.get("top"), field_name="top"),
        )


@dataclass(frozen=True, slots=True)
class BcpVisualRow:
    top: Decimal
    words: tuple[PdfWord, ...]

    def __post_init__(self) -> None:
        if not self.words:
            raise ValueError("a visual row requires at least one word")


@dataclass(frozen=True, slots=True)
class BcpTableBounds:
    top: Decimal
    bottom: Decimal
    header_detected: bool = False
    footer_detected: bool = False

    def __post_init__(self) -> None:
        if self.top < 0 or self.bottom <= self.top:
            raise ValueError("table bounds must define a positive vertical range")


@dataclass(frozen=True, slots=True)
class BcpParsedRow:
    row_type: BcpRowType
    page: int
    description: str = ""
    posting_date: date | None = None
    value_date: date | None = None
    debit: Decimal | None = None
    credit: Decimal | None = None
    balance: Decimal | None = None

    def __post_init__(self) -> None:
        if self.page < 1:
            raise ValueError("page must be positive")


@dataclass(frozen=True, slots=True)
class BcpRowParseResult:
    row: BcpParsedRow | None
    warning_codes: tuple[BcpWarningCode, ...] = ()


@dataclass(frozen=True, slots=True)
class BcpContinuationMergeResult:
    rows: tuple[BcpParsedRow, ...]
    warning_codes: tuple[BcpWarningCode, ...] = ()


@dataclass(frozen=True, slots=True)
class BcpPageReadMetrics:
    page: int
    word_count: int
    row_count: int
    table_top: Decimal
    table_bottom: Decimal
    header_detected: bool
    footer_detected: bool

    def __post_init__(self) -> None:
        if self.page < 1:
            raise ValueError("page must be positive")
        if self.word_count < 0 or self.row_count < 0:
            raise ValueError("counts must be non-negative")


@dataclass(frozen=True, slots=True)
class BcpPdfReadResult:
    probe: DocumentProbe
    page_rows: tuple[tuple[int, BcpVisualRow], ...]
    page_metrics: tuple[BcpPageReadMetrics, ...]
