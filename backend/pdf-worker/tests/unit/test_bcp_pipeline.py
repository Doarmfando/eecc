from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.bcp import (
    BcpRowType,
    BcpVisualRow,
    BcpWarningCode,
    PdfWord,
    process_bcp_visual_rows,
)


def word(text: str, center_x: str, *, top: str) -> PdfWord:
    center = Decimal(center_x)
    return PdfWord(
        text=text,
        x0=center - Decimal("5"),
        x1=center + Decimal("5"),
        top=Decimal(top),
    )


def visual(top: str, *words: tuple[str, str]) -> BcpVisualRow:
    return BcpVisualRow(
        top=Decimal(top),
        words=tuple(word(text, center, top=top) for text, center in words),
    )


class BcpCorePipelineTests(TestCase):
    def test_processes_and_reconciles_synthetic_rows_end_to_end(self) -> None:
        page_rows = (
            (1, visual("210", ("SALDO ANTERIOR", "180"), ("100.00", "500"))),
            (
                1,
                visual(
                    "230",
                    ("01ABR", "50"),
                    ("01ABR", "95"),
                    ("OPERACION SINTETICA", "180"),
                    ("10.00", "380"),
                ),
            ),
            (1, visual("245", ("DETALLE SINTETICO", "180"))),
            (
                1,
                visual(
                    "670",
                    ("TOTAL MOVIMIENTOS", "180"),
                    ("10.00", "380"),
                    ("0.00", "500"),
                ),
            ),
            (1, visual("690", ("SALDO", "180"), ("90.00", "500"))),
        )

        result = process_bcp_visual_rows(page_rows, default_year=2026)

        self.assertEqual(result.validation.status, ExtractionStatus.SUCCEEDED)
        self.assertEqual(len(result.rows), 4)
        movements = [row for row in result.rows if row.row_type is BcpRowType.MOVEMENT]
        self.assertEqual(len(movements), 1)
        self.assertEqual(
            movements[0].description,
            "OPERACION SINTETICA | DETALLE SINTETICO",
        )

    def test_propagates_parser_warning_to_review_status(self) -> None:
        page_rows = (
            (
                1,
                visual(
                    "230",
                    ("01ABR", "50"),
                    ("01ABR", "95"),
                    ("OPERACION SINTETICA", "180"),
                    ("NO-ES-MONTO", "380"),
                ),
            ),
        )

        result = process_bcp_visual_rows(page_rows, default_year=2026)

        self.assertEqual(result.validation.status, ExtractionStatus.NEEDS_REVIEW)
        self.assertIn(BcpWarningCode.AMOUNT_UNPARSEABLE, result.validation.warning_codes)

    def test_empty_input_fails(self) -> None:
        result = process_bcp_visual_rows((), default_year=2026)

        self.assertEqual(result.validation.status, ExtractionStatus.FAILED)
        self.assertEqual(result.rows, ())
