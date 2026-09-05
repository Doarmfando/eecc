from datetime import date
from decimal import Decimal
from unittest import TestCase

from statement_worker.extractors.bcp import (
    BcpParsedRow,
    BcpRowType,
    BcpWarningCode,
    merge_bcp_continuations,
)


def movement(*, page: int = 1, debit: Decimal | None = None) -> BcpParsedRow:
    return BcpParsedRow(
        row_type=BcpRowType.MOVEMENT,
        page=page,
        description="OPERACION SINTETICA",
        posting_date=date(2026, 4, 1),
        value_date=date(2026, 4, 1),
        debit=debit,
    )


def continuation(
    *,
    page: int = 1,
    description: str = "DETALLE SINTETICO",
    debit: Decimal | None = None,
) -> BcpParsedRow:
    return BcpParsedRow(
        row_type=BcpRowType.CONTINUATION,
        page=page,
        description=description,
        debit=debit,
    )


class BcpContinuationTests(TestCase):
    def test_merges_same_page_description_and_missing_amount(self) -> None:
        result = merge_bcp_continuations((movement(), continuation(debit=Decimal("10.00"))))

        self.assertEqual(len(result.rows), 1)
        self.assertEqual(
            result.rows[0].description,
            "OPERACION SINTETICA | DETALLE SINTETICO",
        )
        self.assertEqual(result.rows[0].debit, Decimal("10.00"))
        self.assertEqual(result.warning_codes, ())

    def test_preserves_previous_amount_and_reports_conflict(self) -> None:
        result = merge_bcp_continuations(
            (
                movement(debit=Decimal("10.00")),
                continuation(debit=Decimal("20.00")),
            )
        )

        self.assertEqual(result.rows[0].debit, Decimal("10.00"))
        self.assertIn(BcpWarningCode.CONTINUATION_AMOUNT_CONFLICT, result.warning_codes)

    def test_does_not_merge_across_pages(self) -> None:
        result = merge_bcp_continuations((movement(page=1), continuation(page=2)))

        self.assertEqual(len(result.rows), 2)
        self.assertIn(BcpWarningCode.CROSS_PAGE_CONTINUATION, result.warning_codes)

    def test_does_not_merge_orphan_or_continuation_after_total(self) -> None:
        total = BcpParsedRow(
            row_type=BcpRowType.MOVEMENT_TOTAL,
            page=1,
            description="TOTAL MOVIMIENTO",
        )

        result = merge_bcp_continuations((continuation(), total, continuation()))

        self.assertEqual(len(result.rows), 3)
        self.assertEqual(
            result.warning_codes.count(BcpWarningCode.ORPHAN_CONTINUATION),
            2,
        )

    def test_ignores_empty_continuation_description_when_merging(self) -> None:
        result = merge_bcp_continuations((movement(), continuation(description="")))

        self.assertEqual(result.rows[0].description, "OPERACION SINTETICA")
