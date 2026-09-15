"""Modelos propios de la plantilla del Banco de la Nación, antes del contrato de salida."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum

from statement_worker.domain.models import Detection, DocumentProbe


class BancoNacionRowType(StrEnum):
    MOVEMENT = "MOVEMENT"
    # Saldo con el que empieza el periodo (`SALDO ANTERIOR`, `SALDO INICIAL`).
    OPENING_BALANCE = "OPENING_BALANCE"
    # Saldo que se arrastra entre páginas (`VAN`, `VIENEN`): no abre ni cierra nada,
    # pero tiene que coincidir con el saldo que llevaba el documento en ese punto.
    CARRIED_BALANCE = "CARRIED_BALANCE"
    CLOSING_BALANCE = "CLOSING_BALANCE"
    # Totales de cargos y abonos impresos por el banco; puede faltar uno de los dos.
    DECLARED_TOTALS = "DECLARED_TOTALS"


class BancoNacionWarningCode(StrEnum):
    # Sin cabecera de columnas no se sabe qué importe es cargo, abono o saldo.
    HEADER_NOT_FOUND = "BANCO_NACION_HEADER_NOT_FOUND"
    # Una fila con importes que no encaja en ningún tipo conocido: podría ser un
    # movimiento perdido, así que el resultado no puede darse por bueno.
    ROW_UNCLASSIFIED = "BANCO_NACION_ROW_UNCLASSIFIED"
    # Un importe cuya columna no se pudo decidir por la posición ni por su signo.
    AMOUNT_SIDE_UNKNOWN = "BANCO_NACION_AMOUNT_SIDE_UNKNOWN"
    # Una fecha `dd/mm` sin año en un documento que tampoco declara su periodo.
    DATE_WITHOUT_YEAR = "BANCO_NACION_DATE_WITHOUT_YEAR"


@dataclass(frozen=True, slots=True)
class BancoNacionWord:
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
class BancoNacionParsedRow:
    """Fila ya interpretada. Cargo y abono son magnitudes no negativas; el saldo no."""

    row_type: BancoNacionRowType
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
        if self.debit is not None and self.debit < 0:
            raise ValueError("debit must be non-negative")
        if self.credit is not None and self.credit < 0:
            raise ValueError("credit must be non-negative")
        if self.row_type is BancoNacionRowType.MOVEMENT:
            if (self.debit is None) == (self.credit is None):
                raise ValueError("a movement carries exactly one of debit or credit")
            if self.posting_date is None:
                raise ValueError("a movement requires a posting date")
        elif self.row_type is BancoNacionRowType.DECLARED_TOTALS:
            if self.debit is None and self.credit is None:
                raise ValueError("declared totals require at least one amount")
        elif self.balance is None:
            raise ValueError("a balance row requires a balance")


@dataclass(frozen=True, slots=True)
class BancoNacionPageMetrics:
    page: int
    word_count: int
    row_count: int
    header_detected: bool


@dataclass(frozen=True, slots=True)
class BancoNacionPageReadout:
    """Lo que el lector entrega de una página: filas visuales, sin reglas bancarias."""

    page: int
    rows: tuple[tuple[BancoNacionWord, ...], ...]
    word_count: int


@dataclass(frozen=True, slots=True)
class BancoNacionPdfReadResult:
    probe: DocumentProbe
    pages: tuple[BancoNacionPageReadout, ...]


@dataclass(frozen=True, slots=True)
class BancoNacionDocumentRows:
    rows: tuple[BancoNacionParsedRow, ...]
    page_metrics: tuple[BancoNacionPageMetrics, ...]
    warning_codes: tuple[BancoNacionWarningCode, ...] = ()
    currency: str | None = None


@dataclass(frozen=True, slots=True)
class BancoNacionProcessingResult:
    detection: Detection
    document: BancoNacionDocumentRows
