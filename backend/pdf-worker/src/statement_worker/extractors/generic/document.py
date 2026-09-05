"""Lectura de un documento completo con un único mapa de columnas.

Un estado de cuenta de varias páginas suele imprimir el encabezado solo en la
primera, o repetirlo con variaciones. Resolver cada página por separado desperdicia
lo aprendido y deja páginas sin leer.

Aquí el mapa se resuelve una vez —por encabezado o por aritmética sobre las filas de
todo el documento— y se aplica a todas las páginas cuya forma coincida.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from statement_worker.parsing.columns import ColumnRole

from .inference import infer_columns, select_movement_rows
from .rows import GenericParsedRow, GenericWarningCode, Table, find_header, parse_rows_with_mapping


class ColumnSource(StrEnum):
    HEADER = "HEADER"
    INFERRED = "INFERRED"


@dataclass(frozen=True, slots=True)
class ColumnLayout:
    mapping: dict[ColumnRole, int]
    source: ColumnSource
    width: int


@dataclass(frozen=True, slots=True)
class DocumentReadResult:
    rows: tuple[GenericParsedRow, ...]
    layout: ColumnLayout | None
    warning_codes: tuple[GenericWarningCode, ...]


def _table_width(table: Table) -> int:
    return max((len(row) for row in table), default=0)


def resolve_layout(tables: tuple[tuple[int, Table], ...]) -> ColumnLayout | None:
    """Encuentra el mapa de columnas del documento.

    Primero busca un encabezado nombrable en cualquier página. Si no lo hay, deduce
    las columnas con las filas de movimiento de todo el documento, que son muchas más
    que las de una sola página y hacen la deducción más difícil de sostener por azar.
    """

    for _page, table in tables:
        header = find_header(table)
        if header is not None:
            _index, mapping = header
            return ColumnLayout(
                mapping=mapping, source=ColumnSource.HEADER, width=_table_width(table)
            )

    widths: dict[int, list[Table]] = {}
    for _page, table in tables:
        widths.setdefault(_table_width(table), []).append(table)

    # Se deduce sobre el ancho más frecuente: es el de la tabla de movimientos.
    for width, group in sorted(widths.items(), key=lambda item: -len(item[1])):
        combined = tuple(row for table in group for row in select_movement_rows(table))
        inferred = infer_columns(combined)
        if inferred is not None:
            return ColumnLayout(mapping=inferred.mapping, source=ColumnSource.INFERRED, width=width)
    return None


def read_document(
    tables: tuple[tuple[int, Table], ...],
    *,
    default_year: int | None = None,
) -> DocumentReadResult:
    """Aplica el mapa del documento a cada tabla compatible."""

    layout = resolve_layout(tables)
    if layout is None:
        return DocumentReadResult((), None, (GenericWarningCode.HEADER_NOT_RECOGNISED,))

    rows: list[GenericParsedRow] = []
    warnings: list[GenericWarningCode] = []
    if layout.source is ColumnSource.INFERRED:
        warnings.append(GenericWarningCode.COLUMNS_INFERRED)

    for page, table in tables:
        if _table_width(table) != layout.width:
            # Una tabla de otra forma no comparte columnas: leerla con este mapa
            # pondría los importes en el lugar equivocado.
            continue
        parsed = parse_rows_with_mapping(
            table,
            mapping=layout.mapping,
            page=page,
            default_year=default_year,
        )
        rows.extend(parsed.rows)
        warnings.extend(parsed.warning_codes)

    return DocumentReadResult(
        rows=tuple(rows),
        layout=layout,
        warning_codes=tuple(dict.fromkeys(warnings)),
    )
