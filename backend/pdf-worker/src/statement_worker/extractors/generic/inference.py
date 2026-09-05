"""Deducción del rol de cada columna cuando el encabezado no dice nada.

En vez de ampliar un diccionario de sinónimos banco por banco, aquí se resuelve la
pregunta con la aritmética del propio documento: de todas las formas posibles de
asignar las columnas numéricas a cargo, abono y saldo, solo una hace que el saldo
avance correctamente fila tras fila. Esa asignación no se adivina: se demuestra.

Si ninguna combinación cuadra, o si más de una lo hace, no se deduce nada.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from itertools import permutations

from statement_worker.parsing.amounts import parse_amount
from statement_worker.parsing.columns import ColumnRole
from statement_worker.parsing.dates import parse_statement_date
from statement_worker.parsing.text import normalize_spaces

Table = tuple[tuple[str | None, ...], ...]

# Proporción mínima de celdas de un tipo para considerar que la columna es de ese tipo.
_TYPE_RATIO = Decimal("0.6")
# Con pocas transiciones, que la aritmética cuadre puede ser casualidad.
MINIMUM_INFERRED_TRANSITIONS = 4


@dataclass(frozen=True, slots=True)
class ColumnProfile:
    index: int
    filled: int
    dates: int
    amounts: int
    letters: int

    @property
    def is_date(self) -> bool:
        return self.filled > 0 and Decimal(self.dates) / self.filled >= _TYPE_RATIO

    @property
    def is_amount(self) -> bool:
        return self.filled > 0 and Decimal(self.amounts) / self.filled >= _TYPE_RATIO


@dataclass(frozen=True, slots=True)
class InferredColumns:
    mapping: dict[ColumnRole, int]
    verified_transitions: int


def select_movement_rows(rows: Table) -> Table:
    """Conserva solo las filas que parecen movimientos.

    Los títulos, encabezados y pies del documento distorsionan el perfil de cada
    columna: una fila de movimiento trae una fecha y al menos dos importes.
    """

    selected: list[tuple[str | None, ...]] = []
    for row in rows:
        dates = 0
        amounts = 0
        for cell in row:
            raw = normalize_spaces(cell)
            if not raw:
                continue
            if parse_statement_date(raw) is not None:
                dates += 1
            elif parse_amount(raw) is not None:
                amounts += 1
        if dates >= 1 and amounts >= 2:
            selected.append(row)
    return tuple(selected)


def profile_columns(rows: Table) -> tuple[ColumnProfile, ...]:
    """Describe cada columna por el tipo de contenido que predomina."""

    width = max((len(row) for row in rows), default=0)
    profiles: list[ColumnProfile] = []
    for index in range(width):
        filled = dates = amounts = letters = 0
        for row in rows:
            raw = normalize_spaces(row[index]) if index < len(row) else ""
            if not raw:
                continue
            filled += 1
            if parse_statement_date(raw) is not None:
                dates += 1
            elif parse_amount(raw) is not None:
                amounts += 1
            else:
                letters += sum(1 for char in raw if char.isalpha())
        profiles.append(
            ColumnProfile(
                index=index,
                filled=filled,
                dates=dates,
                amounts=amounts,
                letters=letters,
            )
        )
    return tuple(profiles)


def _amount_at(row: tuple[str | None, ...], index: int | None) -> Decimal | None:
    if index is None or index >= len(row):
        return None
    return parse_amount(normalize_spaces(row[index]))


def _count_verified_transitions(
    rows: Table,
    *,
    debit: int | None,
    credit: int | None,
    balance: int,
) -> int | None:
    """Cuenta las transiciones de saldo que cuadran, o `None` si alguna falla."""

    previous: Decimal | None = None
    verified = 0
    for row in rows:
        current = _amount_at(row, balance)
        if current is None:
            continue
        if previous is not None:
            movement = -(_amount_at(row, debit) or Decimal("0")) + (
                _amount_at(row, credit) or Decimal("0")
            )
            if previous + movement != current:
                return None
            verified += 1
        previous = current
    return verified


def _candidate_assignments(
    amount_columns: tuple[int, ...],
) -> tuple[tuple[int | None, int | None, int], ...]:
    """Todas las lecturas posibles: cargo y abono, solo uno, o importe con signo."""

    candidates: list[tuple[int | None, int | None, int]] = []
    for balance in amount_columns:
        rest = tuple(column for column in amount_columns if column != balance)
        for debit, credit in permutations(rest, 2):
            candidates.append((debit, credit, balance))
        for single in rest:
            candidates.append((single, None, balance))
            candidates.append((None, single, balance))
    return tuple(candidates)


def infer_columns(rows: Table) -> InferredColumns | None:
    """Deduce fecha, descripción, cargo, abono y saldo desde el contenido.

    Devuelve `None` cuando el documento no permite demostrar una única lectura.
    """

    data_rows = select_movement_rows(rows)
    if len(data_rows) < MINIMUM_INFERRED_TRANSITIONS + 1:
        return None

    profiles = profile_columns(data_rows)
    date_columns = tuple(profile.index for profile in profiles if profile.is_date)
    amount_columns = tuple(profile.index for profile in profiles if profile.is_amount)
    if not date_columns or len(amount_columns) < 2:
        return None

    text_profiles = [
        profile
        for profile in profiles
        if profile.index not in date_columns and profile.index not in amount_columns
    ]
    description = max(text_profiles, key=lambda profile: profile.letters, default=None)
    if description is None or description.letters == 0:
        return None

    solutions: list[tuple[tuple[int | None, int | None, int], int]] = []
    for debit, credit, balance in _candidate_assignments(amount_columns):
        verified = _count_verified_transitions(
            data_rows,
            debit=debit,
            credit=credit,
            balance=balance,
        )
        if verified is not None and verified >= MINIMUM_INFERRED_TRANSITIONS:
            solutions.append(((debit, credit, balance), verified))

    if len(solutions) != 1:
        # Ninguna lectura cuadra, o varias lo hacen: no hay nada demostrado.
        return None

    (debit, credit, balance), verified = solutions[0]
    mapping: dict[ColumnRole, int] = {
        ColumnRole.POSTING_DATE: date_columns[0],
        ColumnRole.DESCRIPTION: description.index,
        ColumnRole.BALANCE: balance,
    }
    if len(date_columns) > 1:
        mapping[ColumnRole.VALUE_DATE] = date_columns[1]
    if debit is not None:
        mapping[ColumnRole.DEBIT] = debit
    if credit is not None:
        mapping[ColumnRole.CREDIT] = credit

    return InferredColumns(mapping=mapping, verified_transitions=verified)
