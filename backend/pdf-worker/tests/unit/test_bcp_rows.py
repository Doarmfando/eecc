from datetime import date
from decimal import Decimal
from unittest import TestCase

from statement_worker.extractors.bcp import (
    BcpRowType,
    BcpVisualRow,
    BcpWarningCode,
    PdfWord,
    is_bcp_noise,
    parse_bcp_visual_row,
)


def word(text: str, center_x: str, *, top: str = "250") -> PdfWord:
    center = Decimal(center_x)
    return PdfWord(
        text=text,
        x0=center - Decimal("5"),
        x1=center + Decimal("5"),
        top=Decimal(top),
    )


def visual_row(*words: PdfWord) -> BcpVisualRow:
    return BcpVisualRow(top=words[0].top, words=words)


class BcpRowParserTests(TestCase):
    def test_parses_debit_movement_without_float_conversion(self) -> None:
        row = visual_row(
            word("31MAR", "50"),
            word("01ABR", "95"),
            word("OPERACION", "160"),
            word("SINTETICA", "220"),
            word("1,234.56", "380"),
        )

        result = parse_bcp_visual_row(row, page=2, default_year=2026)

        self.assertIsNotNone(result.row)
        assert result.row is not None
        self.assertEqual(result.row.row_type, BcpRowType.MOVEMENT)
        self.assertEqual(result.row.posting_date, date(2026, 3, 31))
        self.assertEqual(result.row.value_date, date(2026, 4, 1))
        self.assertEqual(result.row.description, "OPERACION SINTETICA")
        self.assertEqual(result.row.debit, Decimal("1234.56"))
        self.assertIsNone(result.row.credit)
        self.assertEqual(result.warning_codes, ())

    def test_parses_credit_movement(self) -> None:
        row = visual_row(
            word("01ABR", "50"),
            word("01ABR", "95"),
            word("ABONO SINTETICO", "180"),
            word("10.00", "500"),
        )

        result = parse_bcp_visual_row(row, page=1, default_year=2026)

        assert result.row is not None
        self.assertEqual(result.row.credit, Decimal("10.00"))
        self.assertIsNone(result.row.debit)

    def test_parses_balance_and_total_rows(self) -> None:
        previous = parse_bcp_visual_row(
            visual_row(word("SALDO ANTERIOR", "180"), word("100.00", "500")),
            page=1,
            default_year=2026,
        )
        total = parse_bcp_visual_row(
            visual_row(
                word("TOTAL MOVIMIENTOS", "180"),
                word("30.00", "380"),
                word("50.00", "500"),
            ),
            page=1,
            default_year=2026,
        )
        balance = parse_bcp_visual_row(
            visual_row(word("SALDO", "180"), word("120.00", "500")),
            page=1,
            default_year=2026,
        )

        assert previous.row is not None and total.row is not None and balance.row is not None
        self.assertEqual(previous.row.row_type, BcpRowType.PREVIOUS_BALANCE)
        self.assertEqual(previous.row.balance, Decimal("100.00"))
        self.assertEqual(total.row.row_type, BcpRowType.MOVEMENT_TOTAL)
        self.assertEqual((total.row.debit, total.row.credit), (Decimal("30.00"), Decimal("50.00")))
        self.assertNotIn(BcpWarningCode.BOTH_DEBIT_AND_CREDIT, total.warning_codes)
        self.assertEqual(balance.row.row_type, BcpRowType.BALANCE)
        self.assertEqual(balance.row.balance, Decimal("120.00"))

    def test_parses_description_only_as_continuation(self) -> None:
        result = parse_bcp_visual_row(
            visual_row(word("DETALLE ADICIONAL", "180")),
            page=3,
            default_year=2026,
        )

        assert result.row is not None
        self.assertEqual(result.row.row_type, BcpRowType.CONTINUATION)

    def test_invalid_date_is_unclassified_not_continuation(self) -> None:
        result = parse_bcp_visual_row(
            visual_row(
                word("31XYZ", "50"),
                word("01ABR", "95"),
                word("OPERACION SINTETICA", "180"),
                word("10.00", "380"),
            ),
            page=1,
            default_year=2026,
        )

        assert result.row is not None
        self.assertEqual(result.row.row_type, BcpRowType.UNCLASSIFIED)
        self.assertIn(BcpWarningCode.DATE_UNPARSEABLE, result.warning_codes)
        self.assertIn(BcpWarningCode.ROW_UNCLASSIFIED, result.warning_codes)

    def test_reports_amount_warnings_without_exposing_raw_values(self) -> None:
        invalid = parse_bcp_visual_row(
            visual_row(
                word("01ABR", "50"),
                word("01ABR", "95"),
                word("OPERACION SINTETICA", "180"),
                word("NO-ES-MONTO", "380"),
            ),
            page=1,
            default_year=2026,
        )
        negative_and_two_sided = parse_bcp_visual_row(
            visual_row(
                word("01ABR", "50"),
                word("01ABR", "95"),
                word("OPERACION SINTETICA", "180"),
                word("-10.00", "380"),
                word("5.00", "500"),
            ),
            page=1,
            default_year=2026,
        )

        self.assertIn(BcpWarningCode.AMOUNT_UNPARSEABLE, invalid.warning_codes)
        self.assertIn(BcpWarningCode.NEGATIVE_COLUMN_AMOUNT, negative_and_two_sided.warning_codes)
        self.assertIn(BcpWarningCode.BOTH_DEBIT_AND_CREDIT, negative_and_two_sided.warning_codes)
        self.assertNotIn("NO-ES-MONTO", tuple(str(code) for code in invalid.warning_codes))

    def test_reports_balance_conflict(self) -> None:
        result = parse_bcp_visual_row(
            visual_row(
                word("SALDO ANTERIOR", "180"),
                word("90.00", "380"),
                word("100.00", "500"),
            ),
            page=1,
            default_year=2026,
        )

        assert result.row is not None
        self.assertEqual(result.row.balance, Decimal("100.00"))
        self.assertIn(BcpWarningCode.BALANCE_AMOUNT_CONFLICT, result.warning_codes)

    def test_ignores_empty_outside_and_noise_rows(self) -> None:
        empty = parse_bcp_visual_row(visual_row(word("", "180")), page=1, default_year=2026)
        outside = parse_bcp_visual_row(visual_row(word("FUERA", "600")), page=1, default_year=2026)
        noise = parse_bcp_visual_row(
            visual_row(word("ADVERTENCIA AL CLIENTE", "180")),
            page=1,
            default_year=2026,
        )

        self.assertIsNone(empty.row)
        self.assertIsNone(outside.row)
        self.assertIsNone(noise.row)
        self.assertTrue(is_bcp_noise("Página 1"))

    def test_rejects_invalid_page(self) -> None:
        with self.assertRaises(ValueError):
            parse_bcp_visual_row(
                visual_row(word("DETALLE", "180")),
                page=0,
                default_year=2026,
            )
