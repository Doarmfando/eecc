"""Invariantes del extractor genérico.

Sin conocer la plantilla no se puede confiar en el significado de cada columna. La
única prueba objetiva disponible es la continuidad del saldo: si la columna de saldo
avanza fila a fila restando cargos y sumando abonos, la lectura de las tres columnas
es aritméticamente correcta. Sin esa comprobación el resultado nunca se declara
reconciliado.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from itertools import pairwise

from statement_worker.domain.models import ExtractionStatus

from .rows import GenericParsedRow, GenericWarningCode


class GenericInvariantCode(StrEnum):
    ROWS_PRESENT = "GENERIC_ROWS_PRESENT"
    DATES_PARSED = "GENERIC_DATES_PARSED"
    AMOUNTS_EXCLUSIVE = "GENERIC_AMOUNTS_EXCLUSIVE"
    BALANCE_CONTINUITY = "GENERIC_BALANCE_CONTINUITY"


class GenericCheckStatus(StrEnum):
    PASSED = "PASSED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


@dataclass(frozen=True, slots=True)
class GenericInvariantResult:
    code: GenericInvariantCode
    status: GenericCheckStatus


@dataclass(frozen=True, slots=True)
class GenericValidationReport:
    status: ExtractionStatus
    checks: tuple[GenericInvariantResult, ...]
    warning_codes: tuple[str, ...] = ()
    verified_transitions: int = 0


DEFAULT_TOLERANCE = Decimal("0.01")
# Con pocas transiciones verificadas la coincidencia puede ser casualidad.
MINIMUM_VERIFIED_TRANSITIONS = 5


def _result(code: GenericInvariantCode, status: GenericCheckStatus) -> GenericInvariantResult:
    return GenericInvariantResult(code=code, status=status)


def _zero(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal("0")


def _validate_balance_continuity(
    rows: tuple[GenericParsedRow, ...],
    *,
    tolerance: Decimal,
) -> tuple[GenericInvariantResult, int]:
    with_balance = [row for row in rows if row.balance is not None]
    if len(with_balance) < 2:
        return _result(GenericInvariantCode.BALANCE_CONTINUITY, GenericCheckStatus.SKIPPED), 0

    verified = 0
    for previous, current in pairwise(with_balance):
        expected = previous.balance
        if expected is None or current.balance is None:  # pragma: no cover - filtrado arriba.
            continue
        expected = expected - _zero(current.debit) + _zero(current.credit)
        if abs(expected - current.balance) > tolerance:
            return _result(
                GenericInvariantCode.BALANCE_CONTINUITY, GenericCheckStatus.FAILED
            ), verified
        verified += 1

    return _result(GenericInvariantCode.BALANCE_CONTINUITY, GenericCheckStatus.PASSED), verified


def validate_generic_rows(
    rows: tuple[GenericParsedRow, ...],
    *,
    warning_codes: tuple[str, ...] = (),
    tolerance: Decimal = DEFAULT_TOLERANCE,
) -> GenericValidationReport:
    """Decide el estado sin conocer la plantilla del banco."""

    if not rows:
        return GenericValidationReport(
            status=ExtractionStatus.FAILED,
            checks=(
                _result(GenericInvariantCode.ROWS_PRESENT, GenericCheckStatus.FAILED),
                _result(GenericInvariantCode.DATES_PARSED, GenericCheckStatus.SKIPPED),
                _result(GenericInvariantCode.AMOUNTS_EXCLUSIVE, GenericCheckStatus.SKIPPED),
                _result(GenericInvariantCode.BALANCE_CONTINUITY, GenericCheckStatus.SKIPPED),
            ),
            warning_codes=warning_codes,
        )

    warnings = list(warning_codes)
    exclusive = all(
        row.debit is None or row.credit is None or row.debit == 0 or row.credit == 0 for row in rows
    )
    if not exclusive:
        warnings.append(GenericWarningCode.AMOUNT_UNPARSEABLE.value)

    balance_check, verified = _validate_balance_continuity(rows, tolerance=tolerance)

    checks = (
        _result(GenericInvariantCode.ROWS_PRESENT, GenericCheckStatus.PASSED),
        _result(GenericInvariantCode.DATES_PARSED, GenericCheckStatus.PASSED),
        _result(
            GenericInvariantCode.AMOUNTS_EXCLUSIVE,
            GenericCheckStatus.PASSED if exclusive else GenericCheckStatus.FAILED,
        ),
        balance_check,
    )

    reconciled = (
        balance_check.status is GenericCheckStatus.PASSED
        and verified >= MINIMUM_VERIFIED_TRANSITIONS
        and exclusive
    )
    return GenericValidationReport(
        status=ExtractionStatus.SUCCEEDED if reconciled else ExtractionStatus.NEEDS_REVIEW,
        checks=checks,
        warning_codes=tuple(dict.fromkeys(warnings)),
        verified_transitions=verified,
    )
