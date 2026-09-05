"""Construcción de una rejilla de columnas a partir de la posición de las palabras.

Depender de cómo un extractor de tablas trocee cada página es frágil: la misma
columna puede aparecer con distinto índice en páginas distintas, o desaparecer en
las que no tienen líneas dibujadas.

Aquí las columnas se definen una sola vez para todo el documento, a partir de los
huecos verticales que ninguna palabra ocupa. Así el índice de una columna significa
lo mismo en la página 1 y en la 400, que es lo que permite aprender el mapa una vez.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from statistics import median

from statement_worker.parsing.amounts import parse_amount
from statement_worker.parsing.dates import parse_statement_date

Table = tuple[tuple[str | None, ...], ...]

# Un hueco más estrecho que esto es separación entre palabras, no entre columnas.
MINIMUM_COLUMN_GAP = Decimal("7")
# Una columna con muy pocas palabras suele ser ruido del encabezado o del pie.
MINIMUM_COLUMN_OCCUPANCY = 3
_ROW_TOLERANCE_BOUNDS = (Decimal("1.5"), Decimal("8"))


@dataclass(frozen=True, slots=True)
class GridWord:
    page: int
    top: Decimal
    x0: Decimal
    x1: Decimal
    text: str


def _occupied_ranges(words: tuple[GridWord, ...]) -> list[tuple[Decimal, Decimal]]:
    spans = sorted((word.x0, word.x1) for word in words)
    merged: list[tuple[Decimal, Decimal]] = []
    for start, end in spans:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def detect_column_bounds(
    words: tuple[GridWord, ...],
    *,
    minimum_gap: Decimal = MINIMUM_COLUMN_GAP,
) -> tuple[tuple[Decimal, Decimal], ...]:
    """Devuelve los tramos horizontales que ocupa cada columna."""

    if not words:
        return ()

    merged = _occupied_ranges(words)
    columns: list[tuple[Decimal, Decimal]] = []
    current_start, current_end = merged[0]
    for start, end in merged[1:]:
        if start - current_end >= minimum_gap:
            columns.append((current_start, current_end))
            current_start, current_end = start, end
        else:
            current_end = max(current_end, end)
    columns.append((current_start, current_end))

    populated: list[tuple[Decimal, Decimal]] = []
    for start, end in columns:
        occupancy = sum(1 for word in words if start <= (word.x0 + word.x1) / 2 <= end)
        if occupancy >= MINIMUM_COLUMN_OCCUPANCY:
            populated.append((start, end))
    return tuple(populated)


def estimate_row_tolerance(words: tuple[GridWord, ...]) -> Decimal:
    """Deduce cuánto pueden separarse dos palabras de la misma fila.

    Se calcula desde la separación típica entre líneas del propio documento en vez
    de fijar un número: cada banco usa su propio interlineado.
    """

    tops_by_page: dict[int, set[Decimal]] = {}
    for word in words:
        tops_by_page.setdefault(word.page, set()).add(word.top)

    gaps: list[Decimal] = []
    for tops in tops_by_page.values():
        ordered = sorted(tops)
        gaps.extend(ordered[index + 1] - ordered[index] for index in range(len(ordered) - 1))

    if not gaps:
        return _ROW_TOLERANCE_BOUNDS[0]

    typical = Decimal(str(median(float(gap) for gap in gaps)))
    tolerance = typical * Decimal("0.45")
    lower, upper = _ROW_TOLERANCE_BOUNDS
    return min(max(tolerance, lower), upper)


def group_rows(
    words: tuple[GridWord, ...],
    *,
    tolerance: Decimal,
) -> tuple[tuple[GridWord, ...], ...]:
    """Agrupa las palabras de una página en filas visuales."""

    ordered = sorted(words, key=lambda word: (word.top, word.x0))
    rows: list[list[GridWord]] = []
    anchor: Decimal | None = None
    for word in ordered:
        if anchor is None or word.top - anchor > tolerance:
            rows.append([])
            anchor = word.top
        rows[-1].append(word)
    return tuple(tuple(row) for row in rows)


def is_movement_row(row: tuple[GridWord, ...]) -> bool:
    """Una fila de movimiento trae una fecha y al menos dos importes."""

    dates = 0
    amounts = 0
    for word in row:
        if parse_statement_date(word.text) is not None:
            dates += 1
        elif parse_amount(word.text) is not None:
            amounts += 1
    return dates >= 1 and amounts >= 2


def _column_index(word: GridWord, bounds: tuple[tuple[Decimal, Decimal], ...]) -> int | None:
    center = (word.x0 + word.x1) / 2
    for index, (start, end) in enumerate(bounds):
        if start <= center <= end:
            return index
    return None


def build_page_grids(
    words: tuple[GridWord, ...],
) -> tuple[tuple[tuple[int, Table], ...], tuple[tuple[Decimal, Decimal], ...]]:
    """Agrupa las palabras en filas y en columnas comunes a todo el documento.

    Los límites de columna se calculan únicamente con las filas de movimiento: los
    títulos y el pie del documento cruzan varias columnas y las fundirían en una.
    """

    if not words:
        return (), ()

    tolerance = estimate_row_tolerance(words)
    rows_by_page: dict[int, tuple[tuple[GridWord, ...], ...]] = {}
    for page in sorted({word.page for word in words}):
        page_words = tuple(word for word in words if word.page == page)
        rows_by_page[page] = group_rows(page_words, tolerance=tolerance)

    movement_words = tuple(
        word
        for rows in rows_by_page.values()
        for row in rows
        if is_movement_row(row)
        for word in row
    )
    if not movement_words:
        return (), ()

    bounds = detect_column_bounds(movement_words)
    if len(bounds) < 3:
        return (), bounds

    grids: list[tuple[int, Table]] = []
    for page, rows in rows_by_page.items():
        table: list[tuple[str | None, ...]] = []
        for row in rows:
            columns: list[list[GridWord]] = [[] for _ in bounds]
            for word in row:
                index = _column_index(word, bounds)
                if index is not None:
                    columns[index].append(word)
            cells = tuple(
                " ".join(part.text for part in sorted(column, key=lambda word: word.x0)) or None
                for column in columns
            )
            if any(cells):
                table.append(cells)
        if table:
            grids.append((page, tuple(table)))

    return tuple(grids), bounds
