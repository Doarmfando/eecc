from decimal import Decimal
from unittest import TestCase

from statement_worker.extractors.bcp import (
    BcpColumn,
    PdfWord,
    classify_bcp_column,
    detect_bcp_table_bounds,
    group_words_by_row,
    words_inside_bounds,
)


def make_word(text: str, x0: str, x1: str, top: str) -> PdfWord:
    return PdfWord(text=text, x0=Decimal(x0), x1=Decimal(x1), top=Decimal(top))


class PdfWordTests(TestCase):
    def test_builds_from_pdfplumber_shaped_mapping(self) -> None:
        word = PdfWord.from_mapping({"text": "SINTETICO", "x0": 10, "x1": 20.5, "top": "30"})

        self.assertEqual(word.center_x, Decimal("15.25"))
        self.assertEqual(word.top, Decimal("30"))

    def test_rejects_invalid_mapping_and_coordinates(self) -> None:
        invalid_values = (
            {"text": 10, "x0": 1, "x1": 2, "top": 3},
            {"text": "A", "x0": None, "x1": 2, "top": 3},
            {"text": "A", "x0": -1, "x1": 2, "top": 3},
            {"text": "A", "x0": 3, "x1": 2, "top": 3},
        )
        for value in invalid_values:
            with self.subTest(value=value), self.assertRaises(ValueError):
                PdfWord.from_mapping(value)


class BcpLayoutTests(TestCase):
    def test_groups_rows_and_orders_words_horizontally(self) -> None:
        words = (
            make_word("DOS", "150", "170", "250.9"),
            make_word("OTRA", "40", "60", "254"),
            make_word("UNO", "40", "60", "250"),
        )

        rows = group_words_by_row(words)

        self.assertEqual(len(rows), 2)
        self.assertEqual([word.text for word in rows[0].words], ["UNO", "DOS"])
        self.assertEqual([word.text for word in rows[1].words], ["OTRA"])

    def test_rejects_negative_tolerance(self) -> None:
        with self.assertRaises(ValueError):
            group_words_by_row((), tolerance_y=Decimal("-0.1"))

    def test_classifies_coordinate_boundaries(self) -> None:
        cases = {
            Decimal("29.99"): BcpColumn.OUTSIDE,
            Decimal("30"): BcpColumn.POSTING_DATE,
            Decimal("77.99"): BcpColumn.POSTING_DATE,
            Decimal("78"): BcpColumn.VALUE_DATE,
            Decimal("120"): BcpColumn.DESCRIPTION,
            Decimal("330"): BcpColumn.DEBIT,
            Decimal("455"): BcpColumn.CREDIT,
            Decimal("570"): BcpColumn.OUTSIDE,
        }
        for coordinate, expected in cases.items():
            with self.subTest(coordinate=coordinate):
                self.assertEqual(classify_bcp_column(coordinate), expected)

    def test_detects_dynamic_table_bounds(self) -> None:
        words = (
            make_word("PROC.", "40", "60", "190"),
            make_word("DESCRIPCIÓN", "130", "190", "192"),
            make_word("ADVERTENCIA", "130", "210", "650"),
        )

        bounds = detect_bcp_table_bounds(words)

        self.assertEqual(bounds.top, Decimal("200"))
        self.assertEqual(bounds.bottom, Decimal("646"))
        self.assertTrue(bounds.header_detected)
        self.assertTrue(bounds.footer_detected)

    def test_uses_safe_fallback_for_missing_or_invalid_footer(self) -> None:
        default_bounds = detect_bcp_table_bounds(())
        invalid_footer_bounds = detect_bcp_table_bounds(
            (
                make_word("PROC.", "40", "60", "350"),
                make_word("MENSAJE", "130", "180", "352"),
            )
        )

        self.assertEqual(
            (default_bounds.top, default_bounds.bottom),
            (Decimal("205"), Decimal("720")),
        )
        self.assertEqual(invalid_footer_bounds.top, Decimal("358"))
        self.assertEqual(invalid_footer_bounds.bottom, Decimal("720"))
        self.assertFalse(invalid_footer_bounds.footer_detected)

    def test_filters_words_including_boundaries(self) -> None:
        words = (
            make_word("ANTES", "40", "60", "204"),
            make_word("INICIO", "40", "60", "205"),
            make_word("FIN", "40", "60", "720"),
            make_word("DESPUES", "40", "60", "721"),
        )
        bounds = detect_bcp_table_bounds(())

        selected = words_inside_bounds(words, bounds)

        self.assertEqual([word.text for word in selected], ["INICIO", "FIN"])
