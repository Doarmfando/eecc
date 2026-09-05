"""La rejilla de columnas se define por posición, igual en todas las páginas."""

from decimal import Decimal
from unittest import TestCase

from statement_worker.extractors.generic.word_grid import (
    GridWord,
    build_page_grids,
    detect_column_bounds,
    estimate_row_tolerance,
    is_movement_row,
)


def _word(page: int, top: str, x0: str, x1: str, text: str) -> GridWord:
    return GridWord(
        page=page,
        top=Decimal(top),
        x0=Decimal(x0),
        x1=Decimal(x1),
        text=text,
    )


def _movement_row(
    page: int, top: int, fecha: str, glosa: str, importe: str, saldo: str
) -> list[GridWord]:
    return [
        _word(page, str(top), "40", "90", fecha),
        _word(page, str(top), "130", "260", glosa),
        _word(page, str(top), "330", "380", importe),
        _word(page, str(top), "480", "540", saldo),
    ]


def _document(pages: int = 1) -> tuple[GridWord, ...]:
    words: list[GridWord] = []
    for page in range(1, pages + 1):
        # Un título ancho que cruza varias columnas, como en un documento real.
        words.append(_word(page, "40", "40", "300", "BANCO DE PRUEBA ESTADO DE CUENTA"))
        for index in range(6):
            words.extend(
                _movement_row(
                    page,
                    100 + index * 12,
                    f"0{index + 1}/06/2026",
                    "OPERACION",
                    "100.00",
                    str(1000 - (index + 1) * 100) + ".00",
                )
            )
    return tuple(words)


class WordGridTests(TestCase):
    def test_the_title_does_not_merge_the_columns_it_crosses(self) -> None:
        grids, bounds = build_page_grids(_document())

        self.assertEqual(len(bounds), 4)
        self.assertEqual(len(grids), 1)
        _page, table = grids[0]
        self.assertEqual(max(len(row) for row in table), 4)

    def test_every_page_shares_the_same_columns(self) -> None:
        grids, bounds = build_page_grids(_document(pages=3))

        self.assertEqual(len(grids), 3)
        widths = {len(row) for _page, table in grids for row in table}
        self.assertEqual(widths, {len(bounds)})

    def test_separates_columns_only_where_no_word_reaches(self) -> None:
        words = (
            _word(1, "10", "40", "90", "01/06/2026"),
            _word(1, "10", "93", "150", "GLOSA"),
            _word(1, "22", "40", "90", "02/06/2026"),
            _word(1, "22", "93", "150", "GLOSA"),
            _word(1, "34", "40", "90", "03/06/2026"),
            _word(1, "34", "93", "150", "GLOSA"),
        )

        # Tres puntos de separación no bastan: son espacio entre palabras.
        self.assertEqual(len(detect_column_bounds(words)), 1)

    def test_the_row_tolerance_comes_from_the_document(self) -> None:
        tolerance = estimate_row_tolerance(_document())

        self.assertGreater(tolerance, Decimal("1.5"))
        self.assertLess(tolerance, Decimal("12"))

    def test_recognises_which_rows_look_like_movements(self) -> None:
        movement = tuple(_movement_row(1, 10, "01/06/2026", "OPERACION", "100.00", "900.00"))
        title = (_word(1, "10", "40", "300", "BANCO DE PRUEBA"),)

        self.assertTrue(is_movement_row(movement))
        self.assertFalse(is_movement_row(title))

    def test_returns_nothing_when_there_are_no_movement_rows(self) -> None:
        grids, _bounds = build_page_grids((_word(1, "10", "40", "300", "SOLO UN TITULO"),))

        self.assertEqual(grids, ())
