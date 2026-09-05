"""Validación y reconciliación financiera de filas BCP."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from statement_worker.domain.models import ExtractionStatus

from .models import BcpParsedRow, BcpRowType, BcpWarningCode


class BcpInvariantCode(StrEnum):
    ROWS_PRESENT = "BCP_ROWS_PRESENT"
    ROWS_CLASSIFIED = "BCP_ROWS_CLASSIFIED"
    MOVEMENT_FIELDS = "BCP_MOVEMENT_FIELDS"
    MOVEMENT_AMOUNTS = "BCP_MOVEMENT_AMOUNTS"
    DECLARED_TOTALS = "BCP_DECLARED_TOTALS"
    DOCUMENT_BALANCE = "BCP_DOCUMENT_BALANCE"


class BcpCheckStatus(StrEnum):
    PASSED = "PASSED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


@dataclass(frozen=True, slots=True)
class BcpInvariantResult:
    code: BcpInvariantCode
    status: BcpCheckStatus


@dataclass(frozen=True, slots=True)
class BcpValidationReport:
    status: ExtractionStatus
    checks: tuple[BcpInvariantResult, ...]
    warning_codes: tuple[BcpWarningCode, ...] = ()
    metrics: tuple[tuple[str, int], ...] = ()


def _result(code: BcpInvariantCode, status: BcpCheckStatus) -> BcpInvariantResult:
    return BcpInvariantResult(code=code, status=status)


def _unique_warning_codes(codes: Iterable[BcpWarningCode]) -> tuple[BcpWarningCode, ...]:
    return tuple(dict.fromkeys(codes))


def _active(value: Decimal | None) -> bool:
    return value is not None and value != Decimal("0")


def _amount_or_zero(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal("0")


def _within_tolerance(left: Decimal, right: Decimal, tolerance: Decimal) -> bool:
    return abs(left - right) <= tolerance


def _validate_declared_totals(
    rows: tuple[BcpParsedRow, ...],
    *,
    tolerance: Decimal,
) -> tuple[BcpInvariantResult, tuple[BcpWarningCode, ...]]:
    """Compara cada total impreso con lo que debería sumar.

    La plantilla imprime la etiqueta `TOTAL MOVIMIENTO` al pie de cada página, pero
    solo escribe las cifras una vez, al final, y ese total corresponde al documento
    completo. Un total ausente no es una discrepancia, y el único total impreso de un
    estado de cuenta de varias páginas se contrasta contra la suma de todo el
    documento, no contra la de su página.
    """

    totals_by_page: dict[int, list[BcpParsedRow]] = defaultdict(list)
    movements_by_page: dict[int, list[BcpParsedRow]] = defaultdict(list)

    for row in rows:
        if row.row_type is BcpRowType.MOVEMENT_TOTAL:
            totals_by_page[row.page].append(row)
        elif row.row_type is BcpRowType.MOVEMENT:
            movements_by_page[row.page].append(row)

    if not totals_by_page:
        return _result(BcpInvariantCode.DECLARED_TOTALS, BcpCheckStatus.SKIPPED), ()

    warnings: list[BcpWarningCode] = []
    valid = True
    printed: list[tuple[int, BcpParsedRow]] = []
    for page, totals in totals_by_page.items():
        if len(totals) != 1:
            warnings.append(BcpWarningCode.DUPLICATE_PAGE_TOTAL)
            valid = False
        declared = totals[0]
        if declared.debit is not None or declared.credit is not None:
            printed.append((page, declared))

    if not printed:
        status = BcpCheckStatus.SKIPPED if valid else BcpCheckStatus.FAILED
        return _result(BcpInvariantCode.DECLARED_TOTALS, status), _unique_warning_codes(warnings)

    document_scope = len(printed) == 1 and len(movements_by_page) > 1
    for page, declared in printed:
        scope = (
            [row for rows_in_page in movements_by_page.values() for row in rows_in_page]
            if document_scope
            else movements_by_page.get(page, [])
        )
        calculated_debit = sum(
            (_amount_or_zero(movement.debit) for movement in scope),
            start=Decimal("0"),
        )
        calculated_credit = sum(
            (_amount_or_zero(movement.credit) for movement in scope),
            start=Decimal("0"),
        )
        if not _within_tolerance(
            calculated_debit,
            _amount_or_zero(declared.debit),
            tolerance,
        ) or not _within_tolerance(
            calculated_credit,
            _amount_or_zero(declared.credit),
            tolerance,
        ):
            warnings.append(BcpWarningCode.DECLARED_TOTAL_MISMATCH)
            valid = False

    status = BcpCheckStatus.PASSED if valid else BcpCheckStatus.FAILED
    return _result(BcpInvariantCode.DECLARED_TOTALS, status), _unique_warning_codes(warnings)


def _validate_document_balance(
    rows: tuple[BcpParsedRow, ...],
    *,
    tolerance: Decimal,
) -> tuple[BcpInvariantResult, tuple[BcpWarningCode, ...]]:
    previous_balances = [row for row in rows if row.row_type is BcpRowType.PREVIOUS_BALANCE]
    final_balances = [row for row in rows if row.row_type is BcpRowType.BALANCE]

    if not previous_balances and not final_balances:
        return _result(BcpInvariantCode.DOCUMENT_BALANCE, BcpCheckStatus.SKIPPED), ()

    if (
        not previous_balances
        or not final_balances
        or previous_balances[0].balance is None
        or final_balances[-1].balance is None
    ):
        return (
            _result(BcpInvariantCode.DOCUMENT_BALANCE, BcpCheckStatus.FAILED),
            (BcpWarningCode.BALANCE_RECONCILIATION_INCOMPLETE,),
        )

    movements = [row for row in rows if row.row_type is BcpRowType.MOVEMENT]
    total_debit = sum(
        (_amount_or_zero(movement.debit) for movement in movements),
        start=Decimal("0"),
    )
    total_credit = sum(
        (_amount_or_zero(movement.credit) for movement in movements),
        start=Decimal("0"),
    )
    expected_balance = previous_balances[0].balance + total_credit - total_debit
    if not _within_tolerance(expected_balance, final_balances[-1].balance, tolerance):
        return (
            _result(BcpInvariantCode.DOCUMENT_BALANCE, BcpCheckStatus.FAILED),
            (BcpWarningCode.BALANCE_MISMATCH,),
        )

    return _result(BcpInvariantCode.DOCUMENT_BALANCE, BcpCheckStatus.PASSED), ()


def validate_bcp_rows(
    rows: tuple[BcpParsedRow, ...],
    *,
    upstream_warning_codes: Iterable[BcpWarningCode] = (),
    tolerance: Decimal = Decimal("0.01"),
) -> BcpValidationReport:
    """Evalúa invariantes sin incluir importes ni descripciones en el reporte."""

    if tolerance < 0:
        raise ValueError("tolerance must be non-negative")

    warnings = list(upstream_warning_codes)
    metrics = (
        ("rows", len(rows)),
        ("movements", sum(row.row_type is BcpRowType.MOVEMENT for row in rows)),
        ("unclassified", sum(row.row_type is BcpRowType.UNCLASSIFIED for row in rows)),
        ("continuations", sum(row.row_type is BcpRowType.CONTINUATION for row in rows)),
        ("totals", sum(row.row_type is BcpRowType.MOVEMENT_TOTAL for row in rows)),
    )

    if not rows:
        warnings.append(BcpWarningCode.NO_ROWS)
        empty_checks = (
            _result(BcpInvariantCode.ROWS_PRESENT, BcpCheckStatus.FAILED),
            _result(BcpInvariantCode.ROWS_CLASSIFIED, BcpCheckStatus.SKIPPED),
            _result(BcpInvariantCode.MOVEMENT_FIELDS, BcpCheckStatus.SKIPPED),
            _result(BcpInvariantCode.MOVEMENT_AMOUNTS, BcpCheckStatus.SKIPPED),
            _result(BcpInvariantCode.DECLARED_TOTALS, BcpCheckStatus.SKIPPED),
            _result(BcpInvariantCode.DOCUMENT_BALANCE, BcpCheckStatus.SKIPPED),
        )
        return BcpValidationReport(
            status=ExtractionStatus.FAILED,
            checks=empty_checks,
            warning_codes=_unique_warning_codes(warnings),
            metrics=metrics,
        )

    checks: list[BcpInvariantResult] = [
        _result(BcpInvariantCode.ROWS_PRESENT, BcpCheckStatus.PASSED)
    ]

    has_unclassified = any(row.row_type is BcpRowType.UNCLASSIFIED for row in rows)
    has_continuations = any(row.row_type is BcpRowType.CONTINUATION for row in rows)
    if has_unclassified:
        warnings.append(BcpWarningCode.UNCLASSIFIED_ROWS_PRESENT)
    if has_continuations:
        warnings.append(BcpWarningCode.UNMERGED_CONTINUATIONS_PRESENT)
    rows_classified = not has_unclassified and not has_continuations
    checks.append(
        _result(
            BcpInvariantCode.ROWS_CLASSIFIED,
            BcpCheckStatus.PASSED if rows_classified else BcpCheckStatus.FAILED,
        )
    )

    movements = tuple(row for row in rows if row.row_type is BcpRowType.MOVEMENT)
    if not movements:
        checks.extend(
            (
                _result(BcpInvariantCode.MOVEMENT_FIELDS, BcpCheckStatus.SKIPPED),
                _result(BcpInvariantCode.MOVEMENT_AMOUNTS, BcpCheckStatus.SKIPPED),
            )
        )
    else:
        fields_valid = all(
            movement.posting_date is not None
            and movement.value_date is not None
            and bool(movement.description.strip())
            for movement in movements
        )
        if not fields_valid:
            warnings.append(BcpWarningCode.INVALID_MOVEMENT_FIELDS)
        checks.append(
            _result(
                BcpInvariantCode.MOVEMENT_FIELDS,
                BcpCheckStatus.PASSED if fields_valid else BcpCheckStatus.FAILED,
            )
        )

        amounts_valid = all(
            _active(movement.debit) != _active(movement.credit)
            and (movement.debit is None or movement.debit >= 0)
            and (movement.credit is None or movement.credit >= 0)
            for movement in movements
        )
        if not amounts_valid:
            warnings.append(BcpWarningCode.INVALID_MOVEMENT_AMOUNT)
        checks.append(
            _result(
                BcpInvariantCode.MOVEMENT_AMOUNTS,
                BcpCheckStatus.PASSED if amounts_valid else BcpCheckStatus.FAILED,
            )
        )

    totals_check, totals_warnings = _validate_declared_totals(rows, tolerance=tolerance)
    balance_check, balance_warnings = _validate_document_balance(rows, tolerance=tolerance)
    checks.extend((totals_check, balance_check))
    warnings.extend(totals_warnings)
    warnings.extend(balance_warnings)

    has_failed_check = any(check.status is BcpCheckStatus.FAILED for check in checks)
    status = (
        ExtractionStatus.NEEDS_REVIEW
        if has_failed_check or warnings
        else ExtractionStatus.SUCCEEDED
    )
    return BcpValidationReport(
        status=status,
        checks=tuple(checks),
        warning_codes=_unique_warning_codes(warnings),
        metrics=metrics,
    )
