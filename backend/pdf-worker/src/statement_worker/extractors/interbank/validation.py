"""Reconciliación de un estado de cuenta Interbank.

La plantilla trae todo lo necesario para demostrar la lectura sin suponer nada: saldo
inicial, saldo después de cada movimiento y, al cierre, el total de ingresos, el total
de gastos y el saldo final. El resultado solo se declara correcto cuando las cuatro
comprobaciones cuadran al céntimo.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from statement_worker.domain.models import ExtractionStatus

from .models import InterbankParsedRow, InterbankRowType, InterbankWarningCode


class InterbankInvariantCode(StrEnum):
    ROWS_PRESENT = "INTERBANK_ROWS_PRESENT"
    OPENING_BALANCE = "INTERBANK_OPENING_BALANCE"
    BALANCE_CONTINUITY = "INTERBANK_BALANCE_CONTINUITY"
    DECLARED_TOTALS = "INTERBANK_DECLARED_TOTALS"
    CLOSING_BALANCE = "INTERBANK_CLOSING_BALANCE"


class InterbankCheckStatus(StrEnum):
    PASSED = "PASSED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


@dataclass(frozen=True, slots=True)
class InterbankInvariantResult:
    code: InterbankInvariantCode
    status: InterbankCheckStatus


@dataclass(frozen=True, slots=True)
class InterbankValidationReport:
    status: ExtractionStatus
    checks: tuple[InterbankInvariantResult, ...]
    warning_codes: tuple[InterbankWarningCode, ...] = ()
    total_debits: Decimal = Decimal("0")
    total_credits: Decimal = Decimal("0")
    opening_balance: Decimal | None = None
    closing_balance: Decimal | None = None


# Los importes vienen con dos decimales y se comparan como `Decimal`: no hay
# redondeo que absorber, así que la tolerancia es cero.
_TOLERANCE = Decimal("0")


def _check(code: InterbankInvariantCode, passed: bool | None) -> InterbankInvariantResult:
    if passed is None:
        return InterbankInvariantResult(code, InterbankCheckStatus.SKIPPED)
    return InterbankInvariantResult(
        code, InterbankCheckStatus.PASSED if passed else InterbankCheckStatus.FAILED
    )


def _zero(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal("0")


def _continuity(movements: tuple[InterbankParsedRow, ...], opening: Decimal | None) -> bool | None:
    previous = opening
    compared = 0
    for movement in movements:
        if movement.balance is None:  # pragma: no cover - el modelo lo exige.
            return False
        if previous is not None:
            expected = previous + _zero(movement.credit) - _zero(movement.debit)
            if abs(expected - movement.balance) > _TOLERANCE:
                return False
            compared += 1
        previous = movement.balance
    return True if compared else None


def validate_interbank_rows(
    rows: tuple[InterbankParsedRow, ...],
    *,
    warning_codes: tuple[InterbankWarningCode, ...] = (),
) -> InterbankValidationReport:
    movements = tuple(row for row in rows if row.row_type is InterbankRowType.MOVEMENT)
    opening_row = next(
        (row for row in rows if row.row_type is InterbankRowType.OPENING_BALANCE), None
    )
    closing_row = next(
        (row for row in rows if row.row_type is InterbankRowType.CLOSING_TOTALS), None
    )
    opening = opening_row.balance if opening_row else None
    closing = closing_row.balance if closing_row else None
    total_debits = sum((_zero(row.debit) for row in movements), start=Decimal("0"))
    total_credits = sum((_zero(row.credit) for row in movements), start=Decimal("0"))

    # Un mes sin movimientos es legítimo si el documento declara saldo inicial y cierre.
    has_rows = bool(movements) or (opening_row is not None and closing_row is not None)

    declared_totals: bool | None = None
    closing_balance: bool | None = None
    if closing_row is not None:
        declared_totals = (
            _zero(closing_row.credit) == total_credits and _zero(closing_row.debit) == total_debits
        )
        last_balance = movements[-1].balance if movements else opening
        closing_balance = closing == last_balance and (
            opening is None or opening + total_credits - total_debits == closing
        )

    continuity = _continuity(movements, opening)
    if continuity is None and not movements and opening is not None and closing is not None:
        continuity = opening == closing

    checks = (
        _check(InterbankInvariantCode.ROWS_PRESENT, has_rows),
        _check(InterbankInvariantCode.OPENING_BALANCE, True if opening_row else None),
        _check(InterbankInvariantCode.BALANCE_CONTINUITY, continuity),
        _check(InterbankInvariantCode.DECLARED_TOTALS, declared_totals),
        _check(InterbankInvariantCode.CLOSING_BALANCE, closing_balance),
    )

    if not has_rows:
        status = ExtractionStatus.FAILED
    elif warning_codes or any(check.status is not InterbankCheckStatus.PASSED for check in checks):
        # Sin saldo inicial o sin cierre la lectura no se puede demostrar entera: un
        # documento truncado también produce filas.
        status = ExtractionStatus.NEEDS_REVIEW
    else:
        status = ExtractionStatus.SUCCEEDED

    return InterbankValidationReport(
        status=status,
        checks=checks,
        warning_codes=warning_codes,
        total_debits=total_debits,
        total_credits=total_credits,
        opening_balance=opening,
        closing_balance=closing,
    )
