from datetime import date
from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.bcp import (
    BcpCheckStatus,
    BcpInvariantCode,
    BcpParsedRow,
    BcpRowType,
    BcpWarningCode,
    validate_bcp_rows,
)


def movement(
    *,
    page: int = 1,
    description: str = "OPERACION SINTETICA",
    debit: Decimal | None = None,
    credit: Decimal | None = None,
    with_dates: bool = True,
) -> BcpParsedRow:
    movement_date = date(2026, 4, 1) if with_dates else None
    return BcpParsedRow(
        row_type=BcpRowType.MOVEMENT,
        page=page,
        description=description,
        posting_date=movement_date,
        value_date=movement_date,
        debit=debit,
        credit=credit,
    )


def row(
    row_type: BcpRowType,
    *,
    page: int = 1,
    debit: Decimal | None = None,
    credit: Decimal | None = None,
    balance: Decimal | None = None,
) -> BcpParsedRow:
    return BcpParsedRow(
        row_type=row_type,
        page=page,
        description=row_type.value,
        debit=debit,
        credit=credit,
        balance=balance,
    )


def check_status(report_checks: tuple, code: BcpInvariantCode) -> BcpCheckStatus:
    return next(check.status for check in report_checks if check.code is code)


class BcpValidationTests(TestCase):
    def test_empty_result_fails_without_financial_details(self) -> None:
        report = validate_bcp_rows(())

        self.assertEqual(report.status, ExtractionStatus.FAILED)
        self.assertIn(BcpWarningCode.NO_ROWS, report.warning_codes)
        self.assertEqual(
            check_status(report.checks, BcpInvariantCode.ROWS_PRESENT),
            BcpCheckStatus.FAILED,
        )
        self.assertEqual(dict(report.metrics)["rows"], 0)

    def test_clean_movement_succeeds_when_optional_reconciliations_are_absent(self) -> None:
        report = validate_bcp_rows((movement(debit=Decimal("10.00")),))

        self.assertEqual(report.status, ExtractionStatus.SUCCEEDED)
        self.assertEqual(report.warning_codes, ())
        self.assertEqual(
            check_status(report.checks, BcpInvariantCode.DECLARED_TOTALS),
            BcpCheckStatus.SKIPPED,
        )
        self.assertEqual(
            check_status(report.checks, BcpInvariantCode.DOCUMENT_BALANCE),
            BcpCheckStatus.SKIPPED,
        )

    def test_reconciles_page_totals_and_document_balance(self) -> None:
        rows = (
            row(BcpRowType.PREVIOUS_BALANCE, balance=Decimal("100.00")),
            movement(debit=Decimal("20.00")),
            movement(credit=Decimal("50.00")),
            row(
                BcpRowType.MOVEMENT_TOTAL,
                debit=Decimal("20.00"),
                credit=Decimal("50.00"),
            ),
            row(BcpRowType.BALANCE, balance=Decimal("130.00")),
        )

        report = validate_bcp_rows(rows)

        self.assertEqual(report.status, ExtractionStatus.SUCCEEDED)
        self.assertEqual(
            check_status(report.checks, BcpInvariantCode.DECLARED_TOTALS),
            BcpCheckStatus.PASSED,
        )
        self.assertEqual(
            check_status(report.checks, BcpInvariantCode.DOCUMENT_BALANCE),
            BcpCheckStatus.PASSED,
        )
        self.assertNotIn("130.00", str(report))

    def test_total_mismatch_requires_review(self) -> None:
        rows = (
            movement(debit=Decimal("20.00")),
            row(
                BcpRowType.MOVEMENT_TOTAL,
                debit=Decimal("21.00"),
                credit=Decimal("0.00"),
            ),
        )

        report = validate_bcp_rows(rows)

        self.assertEqual(report.status, ExtractionStatus.NEEDS_REVIEW)
        self.assertIn(BcpWarningCode.DECLARED_TOTAL_MISMATCH, report.warning_codes)

    def test_duplicate_total_requires_review(self) -> None:
        total = row(BcpRowType.MOVEMENT_TOTAL, debit=Decimal("20.00"))
        report = validate_bcp_rows((movement(debit=Decimal("20.00")), total, total))

        self.assertIn(BcpWarningCode.DUPLICATE_PAGE_TOTAL, report.warning_codes)
        self.assertEqual(
            check_status(report.checks, BcpInvariantCode.DECLARED_TOTALS),
            BcpCheckStatus.FAILED,
        )

    def test_balance_mismatch_and_incomplete_balance_require_review(self) -> None:
        mismatch = validate_bcp_rows(
            (
                row(BcpRowType.PREVIOUS_BALANCE, balance=Decimal("100.00")),
                movement(credit=Decimal("10.00")),
                row(BcpRowType.BALANCE, balance=Decimal("111.00")),
            )
        )
        incomplete = validate_bcp_rows(
            (
                movement(credit=Decimal("10.00")),
                row(BcpRowType.BALANCE, balance=Decimal("110.00")),
            )
        )

        self.assertIn(BcpWarningCode.BALANCE_MISMATCH, mismatch.warning_codes)
        self.assertIn(
            BcpWarningCode.BALANCE_RECONCILIATION_INCOMPLETE,
            incomplete.warning_codes,
        )

    def test_unclassified_and_unmerged_continuation_require_review(self) -> None:
        report = validate_bcp_rows(
            (
                row(BcpRowType.UNCLASSIFIED),
                row(BcpRowType.CONTINUATION),
            )
        )

        self.assertEqual(report.status, ExtractionStatus.NEEDS_REVIEW)
        self.assertIn(BcpWarningCode.UNCLASSIFIED_ROWS_PRESENT, report.warning_codes)
        self.assertIn(BcpWarningCode.UNMERGED_CONTINUATIONS_PRESENT, report.warning_codes)
        self.assertEqual(
            check_status(report.checks, BcpInvariantCode.ROWS_CLASSIFIED),
            BcpCheckStatus.FAILED,
        )

    def test_invalid_movement_fields_and_amounts_require_review(self) -> None:
        report = validate_bcp_rows(
            (
                movement(description="", debit=Decimal("-10.00"), with_dates=False),
                movement(debit=Decimal("10.00"), credit=Decimal("10.00")),
                movement(),
            )
        )

        self.assertIn(BcpWarningCode.INVALID_MOVEMENT_FIELDS, report.warning_codes)
        self.assertIn(BcpWarningCode.INVALID_MOVEMENT_AMOUNT, report.warning_codes)
        self.assertEqual(
            check_status(report.checks, BcpInvariantCode.MOVEMENT_FIELDS),
            BcpCheckStatus.FAILED,
        )
        self.assertEqual(
            check_status(report.checks, BcpInvariantCode.MOVEMENT_AMOUNTS),
            BcpCheckStatus.FAILED,
        )

    def test_upstream_warning_is_deduplicated_and_requires_review(self) -> None:
        report = validate_bcp_rows(
            (movement(debit=Decimal("10.00")),),
            upstream_warning_codes=(
                BcpWarningCode.AMOUNT_UNPARSEABLE,
                BcpWarningCode.AMOUNT_UNPARSEABLE,
            ),
        )

        self.assertEqual(report.status, ExtractionStatus.NEEDS_REVIEW)
        self.assertEqual(
            report.warning_codes.count(BcpWarningCode.AMOUNT_UNPARSEABLE),
            1,
        )

    def test_respects_tolerance_and_rejects_negative_tolerance(self) -> None:
        report = validate_bcp_rows(
            (
                movement(debit=Decimal("20.004")),
                row(BcpRowType.MOVEMENT_TOTAL, debit=Decimal("20.00")),
            ),
            tolerance=Decimal("0.01"),
        )

        self.assertEqual(report.status, ExtractionStatus.SUCCEEDED)
        with self.assertRaises(ValueError):
            validate_bcp_rows((), tolerance=Decimal("-0.01"))


class BcpDeclaredTotalsTests(TestCase):
    """La plantilla real imprime la etiqueta en cada página y las cifras solo al final."""

    def _rows(self, *, declared: Decimal | None) -> tuple[BcpParsedRow, ...]:
        rows: list[BcpParsedRow] = []
        for page in (1, 2):
            rows.append(
                BcpParsedRow(
                    row_type=BcpRowType.MOVEMENT,
                    page=page,
                    posting_date=date(2026, 6, 1),
                    value_date=date(2026, 6, 1),
                    description="OPERACION",
                    debit=Decimal("10.00"),
                )
            )
            printed = page == 2 and declared is not None
            rows.append(
                BcpParsedRow(
                    row_type=BcpRowType.MOVEMENT_TOTAL,
                    page=page,
                    description="TOTAL MOVIMIENTO",
                    debit=declared if printed else None,
                    credit=Decimal("0.00") if printed else None,
                )
            )
        return tuple(rows)

    def test_skips_the_check_when_no_page_prints_its_total(self) -> None:
        report = validate_bcp_rows(self._rows(declared=None))

        check = next(c for c in report.checks if c.code is BcpInvariantCode.DECLARED_TOTALS)
        self.assertEqual(check.status, BcpCheckStatus.SKIPPED)
        self.assertNotIn(BcpWarningCode.DECLARED_TOTAL_MISMATCH, report.warning_codes)

    def test_the_only_printed_total_reconciles_against_the_whole_document(self) -> None:
        report = validate_bcp_rows(self._rows(declared=Decimal("20.00")))

        check = next(c for c in report.checks if c.code is BcpInvariantCode.DECLARED_TOTALS)
        self.assertEqual(check.status, BcpCheckStatus.PASSED)

    def test_detects_a_closing_total_that_does_not_match_the_document(self) -> None:
        report = validate_bcp_rows(self._rows(declared=Decimal("10.00")))

        check = next(c for c in report.checks if c.code is BcpInvariantCode.DECLARED_TOTALS)
        self.assertEqual(check.status, BcpCheckStatus.FAILED)
        self.assertIn(BcpWarningCode.DECLARED_TOTAL_MISMATCH, report.warning_codes)

    def test_compares_page_by_page_when_cada_pagina_declara_su_total(self) -> None:
        rows: list[BcpParsedRow] = []
        for page in (1, 2):
            rows.append(
                BcpParsedRow(
                    row_type=BcpRowType.MOVEMENT,
                    page=page,
                    posting_date=date(2026, 6, 1),
                    value_date=date(2026, 6, 1),
                    description="OPERACION",
                    debit=Decimal("10.00"),
                )
            )
            rows.append(
                BcpParsedRow(
                    row_type=BcpRowType.MOVEMENT_TOTAL,
                    page=page,
                    description="TOTAL MOVIMIENTO",
                    debit=Decimal("10.00"),
                    credit=Decimal("0.00"),
                )
            )

        report = validate_bcp_rows(tuple(rows))

        check = next(c for c in report.checks if c.code is BcpInvariantCode.DECLARED_TOTALS)
        self.assertEqual(check.status, BcpCheckStatus.PASSED)
