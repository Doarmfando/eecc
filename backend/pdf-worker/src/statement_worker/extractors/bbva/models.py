"""Modelos propios de la plantilla BBVA, antes de llegar al contrato de salida."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum

from statement_worker.domain.models import Detection, DocumentProbe


class BbvaRowType(StrEnum):
    MOVEMENT = "MOVEMENT"
    OPENING_BALANCE = "OPENING_BALANCE"
    # `TOTALES POR ITF`: CARGOS, ABONOS, DEVOLUCIONES y PAGOS del impuesto.
    DECLARED_ITF_TOTALS = "DECLARED_ITF_TOTALS"


class BbvaWarningCode(StrEnum):
    # Una fila con importes que no encaja en ningún tipo conocido: podría ser un
    # movimiento perdido, así que el resultado no puede darse por bueno.
    ROW_UNCLASSIFIED = "BBVA_ROW_UNCLASSIFIED"
    # Los importes de la fila no se reparten entre `CARGO/ABONO`, `ITF` y `SALDO`.
    AMOUNT_COLUMN_UNKNOWN = "BBVA_AMOUNT_COLUMN_UNKNOWN"
    # Las fechas son `dd-mm` y el documento no trae de dónde sacar el año.
    DATE_WITHOUT_YEAR = "BBVA_DATE_WITHOUT_YEAR"
    HEADER_NOT_FOUND = "BBVA_HEADER_NOT_FOUND"
    DUPLICATE_OPENING_BALANCE = "BBVA_DUPLICATE_OPENING_BALANCE"


@dataclass(frozen=True, slots=True)
class BbvaWord:
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
class BbvaParsedRow:
    """Fila ya interpretada.

    `amount` conserva el signo que imprime la columna `CARGO/ABONO`: negativo es
    cargo y positivo abono, que es como lo declara el banco. `itf` es el impuesto
    de esa misma fila, siempre una magnitud no negativa que **descuenta** del
    saldo; se guarda aparte porque el documento lo imprime en su propia columna y
    lo totaliza por separado.
    """

    row_type: BbvaRowType
    page: int
    description: str = ""
    posting_date: date | None = None
    value_date: date | None = None
    amount: Decimal | None = None
    itf: Decimal | None = None
    balance: Decimal | None = None
    # Solo en `DECLARED_ITF_TOTALS`: el rótulo que declara el importe.
    label: str = ""

    def __post_init__(self) -> None:
        if self.page < 1:
            raise ValueError("page must be positive")
        if self.itf is not None and self.itf < 0:
            raise ValueError("itf must be non-negative")
        if self.row_type is BbvaRowType.MOVEMENT and (
            self.posting_date is None or self.balance is None or self.amount is None
        ):
            raise ValueError("a movement requires a date, an amount and a balance")

    @property
    def debit(self) -> Decimal | None:
        """Cargo como magnitud no negativa, con su ITF incluido."""

        if self.amount is None:
            return None
        total = self.amount - (self.itf or Decimal("0"))
        return -total if total < 0 else None

    @property
    def credit(self) -> Decimal | None:
        """Abono como magnitud no negativa, neto del ITF que lo acompañe."""

        if self.amount is None:
            return None
        total = self.amount - (self.itf or Decimal("0"))
        return total if total > 0 else None


@dataclass(frozen=True, slots=True)
class BbvaPageMetrics:
    page: int
    word_count: int
    row_count: int
    header_detected: bool


@dataclass(frozen=True, slots=True)
class BbvaPageReadout:
    """Lo que el lector entrega de una página: filas visuales, sin reglas bancarias."""

    page: int
    rows: tuple[tuple[BbvaWord, ...], ...]
    word_count: int


@dataclass(frozen=True, slots=True)
class BbvaPdfReadResult:
    probe: DocumentProbe
    pages: tuple[BbvaPageReadout, ...]


@dataclass(frozen=True, slots=True)
class BbvaDocumentRows:
    rows: tuple[BbvaParsedRow, ...]
    page_metrics: tuple[BbvaPageMetrics, ...]
    warning_codes: tuple[BbvaWarningCode, ...] = ()
    currency: str | None = None


@dataclass(frozen=True, slots=True)
class BbvaProcessingResult:
    detection: Detection
    document: BbvaDocumentRows
