"""Modelos propios de la plantilla Interbank, antes de llegar al contrato de salida."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum

from statement_worker.domain.models import Detection, DocumentProbe


class InterbankRowType(StrEnum):
    MOVEMENT = "MOVEMENT"
    OPENING_BALANCE = "OPENING_BALANCE"
    CLOSING_TOTALS = "CLOSING_TOTALS"


class InterbankWarningCode(StrEnum):
    # Una fila con importes que no encaja en ningún tipo conocido: podría ser un
    # movimiento perdido, así que el resultado no puede darse por bueno.
    ROW_UNCLASSIFIED = "INTERBANK_ROW_UNCLASSIFIED"
    # Un importe sin signo cuya columna tampoco pudo deducirse de la cabecera.
    AMOUNT_SIDE_UNKNOWN = "INTERBANK_AMOUNT_SIDE_UNKNOWN"
    DUPLICATE_OPENING_BALANCE = "INTERBANK_DUPLICATE_OPENING_BALANCE"


@dataclass(frozen=True, slots=True)
class InterbankWord:
    text: str
    x0: Decimal
    x1: Decimal
    top: Decimal

    def __post_init__(self) -> None:
        if self.x1 < self.x0:
            raise ValueError("x1 must be greater than or equal to x0")

    @property
    def center_x(self) -> Decimal:
        return (self.x0 + self.x1) / Decimal("2")


@dataclass(frozen=True, slots=True)
class InterbankParsedRow:
    """Fila ya interpretada. Los importes son magnitudes no negativas salvo el saldo."""

    row_type: InterbankRowType
    page: int
    description: str = ""
    posting_date: date | None = None
    debit: Decimal | None = None
    credit: Decimal | None = None
    balance: Decimal | None = None

    def __post_init__(self) -> None:
        if self.page < 1:
            raise ValueError("page must be positive")
        if self.debit is not None and self.debit < 0:
            raise ValueError("debit must be non-negative")
        if self.credit is not None and self.credit < 0:
            raise ValueError("credit must be non-negative")
        if self.row_type is InterbankRowType.MOVEMENT:
            if (self.debit is None) == (self.credit is None):
                raise ValueError("a movement carries exactly one of debit or credit")
            if self.posting_date is None or self.balance is None:
                raise ValueError("a movement requires a date and a balance")


@dataclass(frozen=True, slots=True)
class InterbankPageMetrics:
    page: int
    word_count: int
    row_count: int
    header_detected: bool
    guide_page: bool


@dataclass(frozen=True, slots=True)
class InterbankPageReadout:
    """Lo que el lector entrega de una página: filas visuales, sin reglas bancarias."""

    page: int
    rows: tuple[tuple[InterbankWord, ...], ...]
    word_count: int


@dataclass(frozen=True, slots=True)
class InterbankPdfReadResult:
    probe: DocumentProbe
    pages: tuple[InterbankPageReadout, ...]


@dataclass(frozen=True, slots=True)
class InterbankDocumentRows:
    rows: tuple[InterbankParsedRow, ...]
    page_metrics: tuple[InterbankPageMetrics, ...]
    warning_codes: tuple[InterbankWarningCode, ...] = ()
    currency: str | None = None


@dataclass(frozen=True, slots=True)
class InterbankProcessingResult:
    detection: Detection
    document: InterbankDocumentRows
