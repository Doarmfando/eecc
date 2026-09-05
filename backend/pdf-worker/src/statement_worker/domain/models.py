"""Modelos inmutables del núcleo de extracción."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum


class WarningSeverity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"


class ExtractionStatus(StrEnum):
    SUCCEEDED = "SUCCEEDED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    FAILED = "FAILED"


@dataclass(frozen=True, slots=True)
class Period:
    year: int | None = None
    month: int | None = None

    def __post_init__(self) -> None:
        if self.month is not None and not 1 <= self.month <= 12:
            raise ValueError("month must be between 1 and 12")
        if self.year is not None and self.year < 1900:
            raise ValueError("year must be 1900 or later")


@dataclass(frozen=True, slots=True)
class DocumentProbe:
    """Señales efímeras necesarias para detectar una plantilla.

    `first_page_text` nunca debe copiarse a logs, excepciones o resultados.
    """

    first_page_text: str
    page_count: int | None = None
    page_width: Decimal | None = None
    page_height: Decimal | None = None


@dataclass(frozen=True, slots=True)
class Detection:
    extractor_id: str
    extractor_version: str
    confidence: Decimal
    evidence_codes: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not Decimal("0") <= self.confidence <= Decimal("1"):
            raise ValueError("confidence must be between 0 and 1")


@dataclass(frozen=True, slots=True)
class ExtractionWarning:
    code: str
    severity: WarningSeverity
    page: int | None = None

    def __post_init__(self) -> None:
        if self.page is not None and self.page < 1:
            raise ValueError("page must be positive")


@dataclass(frozen=True, slots=True)
class Movement:
    description: str
    page: int
    posting_date: date | None = None
    value_date: date | None = None
    debit: Decimal | None = None
    credit: Decimal | None = None
    balance: Decimal | None = None
    source: str = ""

    def __post_init__(self) -> None:
        if not self.description.strip():
            raise ValueError("description is required")
        if self.page < 1:
            raise ValueError("page must be positive")
        if self.debit is not None and self.debit < 0:
            raise ValueError("debit must be non-negative")
        if self.credit is not None and self.credit < 0:
            raise ValueError("credit must be non-negative")
        if self.debit not in (None, Decimal("0")) and self.credit not in (None, Decimal("0")):
            raise ValueError("a movement cannot have both debit and credit")


@dataclass(frozen=True, slots=True)
class ExtractionResult:
    extractor_id: str
    extractor_version: str
    status: ExtractionStatus
    movements: tuple[Movement, ...] = ()
    warnings: tuple[ExtractionWarning, ...] = ()
    metrics: tuple[tuple[str, int], ...] = ()
