"""Lectura de una tabla de movimientos cuyo encabezado se pudo nombrar.

Reglas de esta estrategia:

- solo se leen columnas cuyo encabezado fue reconocido;
- un importe nunca se clasifica por palabras de la descripción;
- una fila sin fecha válida o sin ningún importe no se inventa: se descarta.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date
from decimal import Decimal
from enum import StrEnum

from statement_worker.parsing.amounts import parse_amount
from statement_worker.parsing.columns import ColumnRole, is_usable_header, map_header_row
from statement_worker.parsing.dates import parse_statement_date
from statement_worker.parsing.text import normalize_spaces

from .inference import infer_columns

Table = tuple[tuple[str | None, ...], ...]


class GenericWarningCode(StrEnum):
    HEADER_NOT_RECOGNISED = "GENERIC_HEADER_NOT_RECOGNISED"
    COLUMNS_INFERRED = "GENERIC_COLUMNS_INFERRED"
    ROW_WITHOUT_DATE = "GENERIC_ROW_WITHOUT_DATE"
    ROW_WITHOUT_AMOUNT = "GENERIC_ROW_WITHOUT_AMOUNT"
    AMOUNT_UNPARSEABLE = "GENERIC_AMOUNT_UNPARSEABLE"
    BALANCE_COLUMN_MISSING = "GENERIC_BALANCE_COLUMN_MISSING"


@dataclass(frozen=True, slots=True)
class GenericParsedRow:
    page: int
    posting_date: date
    description: str
    value_date: date | None = None
    debit: Decimal | None = None
    credit: Decimal | None = None
    balance: Decimal | None = None
    reference: str | None = None


@dataclass(frozen=True, slots=True)
class GenericTableResult:
    rows: tuple[GenericParsedRow, ...]
    roles: tuple[ColumnRole, ...]
    warning_codes: tuple[GenericWarningCode, ...]


def _cell(cells: tuple[str | None, ...], index: int | None) -> str:
    if index is None or index >= len(cells):
        return ""
    return normalize_spaces(cells[index])


def find_header(table: Table) -> tuple[int, dict[ColumnRole, int]] | None:
    """Busca la primera fila que nombre las columnas necesarias."""

    for index, row in enumerate(table):
        mapping = map_header_row(row)
        if is_usable_header(mapping):
            return index, mapping
    return None


def parse_rows_with_mapping(
    table: Table,
    *,
    mapping: dict[ColumnRole, int],
    page: int,
    default_year: int | None = None,
    skip_until: int = 0,
) -> GenericTableResult:
    """Lee las filas con un mapa de columnas ya resuelto.

    Una fila sin fecha ni importes que trae solo texto se considera continuación de
    la descripción anterior: los estados de cuenta parten descripciones largas en
    varias líneas y perderlas empobrece el resultado sin motivo.
    """

    warnings: list[GenericWarningCode] = []
    if ColumnRole.BALANCE not in mapping:
        warnings.append(GenericWarningCode.BALANCE_COLUMN_MISSING)

    rows: list[GenericParsedRow] = []
    for cells in table[skip_until:]:
        posting_date = parse_statement_date(
            _cell(cells, mapping.get(ColumnRole.POSTING_DATE)),
            default_year=default_year,
        )

        amounts: dict[ColumnRole, Decimal | None] = {}
        for role in (ColumnRole.DEBIT, ColumnRole.CREDIT, ColumnRole.BALANCE):
            raw = _cell(cells, mapping.get(role))
            if not raw:
                amounts[role] = None
                continue
            parsed = parse_amount(raw)
            # Un rótulo de encabezado o un texto de pie no es un importe ilegible:
            # solo se avisa cuando la fila sí corresponde a un movimiento.
            if parsed is None and posting_date is not None:
                warnings.append(GenericWarningCode.AMOUNT_UNPARSEABLE)
            amounts[role] = parsed

        description = _cell(cells, mapping.get(ColumnRole.DESCRIPTION))
        has_amount = any(amounts[role] is not None for role in amounts)

        if posting_date is None:
            if description and not has_amount and rows:
                previous = rows[-1]
                rows[-1] = replace(
                    previous,
                    description=f"{previous.description} | {description}".strip(" |"),
                )
                continue
            if any(normalize_spaces(cell) for cell in cells):
                warnings.append(GenericWarningCode.ROW_WITHOUT_DATE)
            continue

        no_movement_amount = all(
            amounts[role] is None for role in (ColumnRole.DEBIT, ColumnRole.CREDIT)
        )
        if no_movement_amount and amounts[ColumnRole.BALANCE] is None:
            warnings.append(GenericWarningCode.ROW_WITHOUT_AMOUNT)
            continue

        reference = _cell(cells, mapping.get(ColumnRole.REFERENCE))
        rows.append(
            GenericParsedRow(
                page=page,
                posting_date=posting_date,
                value_date=parse_statement_date(
                    _cell(cells, mapping.get(ColumnRole.VALUE_DATE)),
                    default_year=default_year,
                ),
                description=description,
                debit=amounts[ColumnRole.DEBIT],
                credit=amounts[ColumnRole.CREDIT],
                balance=amounts[ColumnRole.BALANCE],
                reference=reference or None,
            )
        )

    return GenericTableResult(
        rows=tuple(rows),
        roles=tuple(sorted(mapping, key=lambda role: mapping[role])),
        warning_codes=tuple(dict.fromkeys(warnings)),
    )


def parse_generic_table(
    table: Table,
    *,
    page: int,
    default_year: int | None = None,
) -> GenericTableResult:
    """Resuelve el mapa de una sola tabla y la lee."""

    header = find_header(table)
    if header is not None:
        header_index, mapping = header
        return parse_rows_with_mapping(
            table,
            mapping=mapping,
            page=page,
            default_year=default_year,
            skip_until=header_index + 1,
        )

    inferred = infer_columns(table)
    if inferred is None:
        return GenericTableResult((), (), (GenericWarningCode.HEADER_NOT_RECOGNISED,))

    result = parse_rows_with_mapping(
        table,
        mapping=inferred.mapping,
        page=page,
        default_year=default_year,
    )
    return GenericTableResult(
        rows=result.rows,
        roles=result.roles,
        warning_codes=(GenericWarningCode.COLUMNS_INFERRED, *result.warning_codes),
    )
