"""Reconciliación de un estado de cuenta del BBVA.

La ecuación de esta plantilla incluye el impuesto, porque el banco lo imprime en
columna aparte pero lo descuenta igual:

    saldo = saldo anterior + (cargo/abono) - itf

Sobre el documento real esa forma cuadra en las 59 transiciones y la que ignora el
ITF falla en 28, así que no es una interpretación entre varias posibles: es la que
el documento demuestra.

El resultado solo se declara correcto cuando se demuestra entero y al céntimo:
saldo inicial declarado, saldo que avanza fila a fila, saldo final igual al último
saldo y a `inicial + movimientos - itf`, y —si el documento los imprime— los
totales de `TOTALES POR ITF` iguales a la suma de la columna.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from statement_worker.domain.models import ExtractionStatus

from .models import BbvaParsedRow, BbvaRowType, BbvaWarningCode


class BbvaInvariantCode(StrEnum):
    ROWS_PRESENT = "BBVA_ROWS_PRESENT"
    OPENING_BALANCE = "BBVA_OPENING_BALANCE"
    BALANCE_CONTINUITY = "BBVA_BALANCE_CONTINUITY"
    ITF_TOTALS = "BBVA_ITF_TOTALS"
    CLOSING_BALANCE = "BBVA_CLOSING_BALANCE"


class BbvaCheckStatus(StrEnum):
    PASSED = "PASSED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


@dataclass(frozen=True, slots=True)
class BbvaInvariantResult:
    code: BbvaInvariantCode
    status: BbvaCheckStatus


@dataclass(frozen=True, slots=True)
class BbvaValidationReport:
    status: ExtractionStatus
    checks: tuple[BbvaInvariantResult, ...]
    warning_codes: tuple[BbvaWarningCode, ...] = ()
    total_debits: Decimal = Decimal("0")
    total_credits: Decimal = Decimal("0")
    total_itf: Decimal = Decimal("0")
    opening_balance: Decimal | None = None
    closing_balance: Decimal | None = None


def _check(code: BbvaInvariantCode, passed: bool | None) -> BbvaInvariantResult:
    if passed is None:
        return BbvaInvariantResult(code, BbvaCheckStatus.SKIPPED)
    return BbvaInvariantResult(code, BbvaCheckStatus.PASSED if passed else BbvaCheckStatus.FAILED)


def _zero(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal("0")


def _continuity(
    movements: tuple[BbvaParsedRow, ...], opening: Decimal | None
) -> tuple[bool | None, Decimal | None]:
    """Recorre los movimientos en orden; devuelve el veredicto y el saldo al final."""

    if opening is None or not movements:
        return None, None
    running = opening
    consistent = True
    for row in movements:
        running = running + _zero(row.amount) - _zero(row.itf)
        if row.balance is not None:
            consistent = consistent and running == row.balance
            # Se sigue desde el saldo impreso: un descuadre puntual no debe
            # arrastrarse al resto del documento.
            running = row.balance
    return consistent, running


def _itf_totals(
    movements: tuple[BbvaParsedRow, ...], declared: tuple[BbvaParsedRow, ...]
) -> bool | None:
    """La suma de los rótulos de `TOTALES POR ITF` contra la columna del impuesto.

    El banco reparte el impuesto en cuatro rótulos (`CARGOS`, `ABONOS`,
    `DEVOLUCIONES`, `PAGOS`). Lo que se comprueba es la identidad que el documento
    demuestra: los cuatro suman exactamente la columna.
    """

    if not declared:
        return None
    total = sum((_zero(row.itf) for row in movements), start=Decimal("0"))
    return sum((_zero(row.itf) for row in declared), start=Decimal("0")) == total


def validate_bbva_rows(
    rows: tuple[BbvaParsedRow, ...],
    *,
    warning_codes: tuple[BbvaWarningCode, ...] = (),
) -> BbvaValidationReport:
    movements = tuple(row for row in rows if row.row_type is BbvaRowType.MOVEMENT)
    openings = [
        row.balance
        for row in rows
        if row.row_type is BbvaRowType.OPENING_BALANCE and row.balance is not None
    ]
    declared_itf = tuple(row for row in rows if row.row_type is BbvaRowType.DECLARED_ITF_TOTALS)

    opening = openings[0] if openings else None
    total_debits = sum((_zero(row.debit) for row in movements), start=Decimal("0"))
    total_credits = sum((_zero(row.credit) for row in movements), start=Decimal("0"))
    total_itf = sum((_zero(row.itf) for row in movements), start=Decimal("0"))

    continuity, running = _continuity(movements, opening)
    closing = movements[-1].balance if movements else None

    closing_check: bool | None = None
    if closing is not None and opening is not None:
        movimiento = sum((_zero(row.amount) for row in movements), start=Decimal("0"))
        closing_check = running == closing and opening + movimiento - total_itf == closing

    has_rows = bool(movements)
    checks = (
        _check(BbvaInvariantCode.ROWS_PRESENT, has_rows),
        _check(BbvaInvariantCode.OPENING_BALANCE, len(set(openings)) == 1 if openings else None),
        _check(BbvaInvariantCode.BALANCE_CONTINUITY, continuity),
        _check(BbvaInvariantCode.ITF_TOTALS, _itf_totals(movements, declared_itf)),
        _check(BbvaInvariantCode.CLOSING_BALANCE, closing_check),
    )

    # Los totales de ITF son opcionales: no todos los estados de cuenta los traen.
    # Todo lo demás debe cumplirse para dar la lectura por demostrada.
    optional = {BbvaInvariantCode.ITF_TOTALS}
    proven = all(
        check.status is BbvaCheckStatus.PASSED
        or (check.code in optional and check.status is BbvaCheckStatus.SKIPPED)
        for check in checks
    )
    if not has_rows:
        status = ExtractionStatus.FAILED
    elif warning_codes or not proven:
        status = ExtractionStatus.NEEDS_REVIEW
    else:
        status = ExtractionStatus.SUCCEEDED

    return BbvaValidationReport(
        status=status,
        checks=checks,
        warning_codes=warning_codes,
        total_debits=total_debits,
        total_credits=total_credits,
        total_itf=total_itf,
        opening_balance=opening,
        closing_balance=closing,
    )
