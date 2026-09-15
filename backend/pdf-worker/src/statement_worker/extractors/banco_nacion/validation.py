"""Reconciliación de un estado de cuenta del Banco de la Nación.

El resultado solo se declara correcto cuando el documento se demuestra entero y al
céntimo: saldo inicial declarado, saldo que avanza con cada movimiento —incluidos los
arrastres entre páginas—, totales impresos iguales a la suma de los movimientos y
saldo final igual al último saldo y a `inicial + abonos - cargos`.

Como la plantilla no se ha confirmado con un documento real, cualquier comprobación
que no pueda hacerse deja el resultado en revisión; nunca se da por buena.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from statement_worker.domain.models import ExtractionStatus

from .models import BancoNacionParsedRow, BancoNacionRowType, BancoNacionWarningCode

_BALANCE_ROWS = frozenset(
    {
        BancoNacionRowType.OPENING_BALANCE,
        BancoNacionRowType.CARRIED_BALANCE,
        BancoNacionRowType.CLOSING_BALANCE,
    }
)


class BancoNacionInvariantCode(StrEnum):
    ROWS_PRESENT = "BANCO_NACION_ROWS_PRESENT"
    OPENING_BALANCE = "BANCO_NACION_OPENING_BALANCE"
    BALANCE_CONTINUITY = "BANCO_NACION_BALANCE_CONTINUITY"
    DECLARED_TOTALS = "BANCO_NACION_DECLARED_TOTALS"
    CLOSING_BALANCE = "BANCO_NACION_CLOSING_BALANCE"


class BancoNacionCheckStatus(StrEnum):
    PASSED = "PASSED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


@dataclass(frozen=True, slots=True)
class BancoNacionInvariantResult:
    code: BancoNacionInvariantCode
    status: BancoNacionCheckStatus


@dataclass(frozen=True, slots=True)
class BancoNacionValidationReport:
    status: ExtractionStatus
    checks: tuple[BancoNacionInvariantResult, ...]
    warning_codes: tuple[BancoNacionWarningCode, ...] = ()
    total_debits: Decimal = Decimal("0")
    total_credits: Decimal = Decimal("0")
    opening_balance: Decimal | None = None
    closing_balance: Decimal | None = None


def _check(code: BancoNacionInvariantCode, passed: bool | None) -> BancoNacionInvariantResult:
    if passed is None:
        return BancoNacionInvariantResult(code, BancoNacionCheckStatus.SKIPPED)
    return BancoNacionInvariantResult(
        code, BancoNacionCheckStatus.PASSED if passed else BancoNacionCheckStatus.FAILED
    )


def _zero(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal("0")


def _continuity(
    rows: tuple[BancoNacionParsedRow, ...], opening: Decimal | None
) -> tuple[bool | None, Decimal | None]:
    """Recorre el documento en orden. Devuelve el veredicto y el saldo al terminar.

    Tras cada movimiento el saldo esperado es el anterior más el abono menos el cargo;
    un saldo impreso tiene que coincidir con él. Los saldos declarados después del
    primer movimiento (`VAN`, `VIENEN`, un cierre de página) son puntos de control.
    """

    running = opening
    compared = 0
    consistent = True
    movements_seen = False
    for row in rows:
        if row.row_type is BancoNacionRowType.MOVEMENT:
            movements_seen = True
            if running is not None:
                running = running + _zero(row.credit) - _zero(row.debit)
            if row.balance is not None:
                if running is not None:
                    compared += 1
                    consistent = consistent and running == row.balance
                running = row.balance
        elif row.row_type in _BALANCE_ROWS and movements_seen and running is not None:
            compared += 1
            consistent = consistent and running == row.balance
    return (consistent if compared else None), running


def _declared_totals(rows: tuple[BancoNacionParsedRow, ...]) -> bool | None:
    """Cada total impreso vale para todo el documento, para lo leído hasta él o para
    el tramo desde el total anterior (subtotales por página)."""

    debits = [Decimal("0")]
    credits = [Decimal("0")]
    declarations: list[tuple[int, BancoNacionParsedRow]] = []
    for row in rows:
        if row.row_type is BancoNacionRowType.MOVEMENT:
            debits.append(debits[-1] + _zero(row.debit))
            credits.append(credits[-1] + _zero(row.credit))
        elif row.row_type is BancoNacionRowType.DECLARED_TOTALS:
            declarations.append((len(debits) - 1, row))
    if not declarations:
        return None

    def matches(row: BancoNacionParsedRow, start: int, end: int) -> bool:
        return (row.debit is None or row.debit == debits[end] - debits[start]) and (
            row.credit is None or row.credit == credits[end] - credits[start]
        )

    total = len(debits) - 1
    previous = 0
    for count, row in declarations:
        if count == 0:
            # Resumen impreso antes de la tabla: habla del documento completo.
            passed = matches(row, 0, total)
        else:
            passed = matches(row, 0, count) or matches(row, previous, count)
            previous = count
        if not passed:
            return False
    return True


def validate_banco_nacion_rows(
    rows: tuple[BancoNacionParsedRow, ...],
    *,
    warning_codes: tuple[BancoNacionWarningCode, ...] = (),
) -> BancoNacionValidationReport:
    positions = [
        index for index, row in enumerate(rows) if row.row_type is BancoNacionRowType.MOVEMENT
    ]
    movements = tuple(rows[index] for index in positions)
    first = positions[0] if positions else len(rows)
    last = positions[-1] if positions else -1

    openings = [
        row.balance
        for row in rows[:first]
        if row.row_type is BancoNacionRowType.OPENING_BALANCE and row.balance is not None
    ]
    opening = openings[0] if openings else None

    # El cierre es el último declarado después del último movimiento; uno impreso en
    # un resumen antes de la tabla también cuenta, y los dos tienen que coincidir.
    after = [
        row.balance
        for row in rows[last + 1 :]
        if row.row_type is BancoNacionRowType.CLOSING_BALANCE and row.balance is not None
    ]
    summary = (
        [
            row.balance
            for row in rows[:first]
            if row.row_type is BancoNacionRowType.CLOSING_BALANCE and row.balance is not None
        ]
        if positions
        else []
    )
    closing = after[-1] if after else summary[-1] if summary else None

    total_debits = sum((_zero(row.debit) for row in movements), start=Decimal("0"))
    total_credits = sum((_zero(row.credit) for row in movements), start=Decimal("0"))

    continuity, running = _continuity(rows, opening)
    if continuity is None and not movements and opening is not None and closing is not None:
        continuity = opening == closing

    closing_check: bool | None = None
    if closing is not None:
        conditions = [len(set(after[-1:] + summary)) <= 1]
        if running is not None:
            conditions.append(running == closing)
        if opening is not None:
            conditions.append(opening + total_credits - total_debits == closing)
        closing_check = all(conditions) if len(conditions) > 1 else None

    has_rows = bool(movements) or (opening is not None and closing is not None)
    checks = (
        _check(BancoNacionInvariantCode.ROWS_PRESENT, has_rows),
        _check(
            BancoNacionInvariantCode.OPENING_BALANCE, len(set(openings)) == 1 if openings else None
        ),
        _check(BancoNacionInvariantCode.BALANCE_CONTINUITY, continuity),
        _check(BancoNacionInvariantCode.DECLARED_TOTALS, _declared_totals(rows)),
        _check(BancoNacionInvariantCode.CLOSING_BALANCE, closing_check),
    )

    # Los totales son opcionales: no todos los estados de cuenta los imprimen. Todo lo
    # demás tiene que cumplirse para que la lectura quede demostrada.
    optional = {BancoNacionInvariantCode.DECLARED_TOTALS}
    proven = all(
        check.status is BancoNacionCheckStatus.PASSED
        or (check.code in optional and check.status is BancoNacionCheckStatus.SKIPPED)
        for check in checks
    )
    if not has_rows:
        status = ExtractionStatus.FAILED
    elif warning_codes or not proven:
        status = ExtractionStatus.NEEDS_REVIEW
    else:
        status = ExtractionStatus.SUCCEEDED

    return BancoNacionValidationReport(
        status=status,
        checks=checks,
        warning_codes=warning_codes,
        total_debits=total_debits,
        total_credits=total_credits,
        opening_balance=opening,
        closing_balance=closing,
    )
