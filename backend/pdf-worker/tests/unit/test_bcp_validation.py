from datetime import date
from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.bcp import (
    BcpCheckStatus,
    BcpInvariantCode,
    BcpPageReadMetrics,
    BcpParsedRow,
    BcpRowType,
    BcpValidationReport,
    BcpWarningCode,
    find_sparse_pages,
    flag_incomplete_pages,
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
    def test_an_explicit_zero_on_one_side_is_a_valid_movement(self) -> None:
        for amounts in ({"debit": Decimal("0.00")}, {"credit": Decimal("0.00")}):
            with self.subTest(amounts=amounts):
                report = validate_bcp_rows(
                    (
                        row(BcpRowType.PREVIOUS_BALANCE, balance=Decimal("100.00")),
                        movement(**amounts),
                        row(
                            BcpRowType.MOVEMENT_TOTAL, debit=Decimal("0.00"), credit=Decimal("0.00")
                        ),
                        row(BcpRowType.BALANCE, balance=Decimal("100.00")),
                    )
                )
                self.assertEqual(report.status, ExtractionStatus.SUCCEEDED)
                self.assertEqual(report.warning_codes, ())

    def test_missing_amounts_and_two_zero_columns_remain_ambiguous(self) -> None:
        for amounts in ({}, {"debit": Decimal("0.00"), "credit": Decimal("0.00")}):
            with self.subTest(amounts=amounts):
                report = validate_bcp_rows((movement(**amounts),))
                self.assertEqual(report.status, ExtractionStatus.NEEDS_REVIEW)
                self.assertIn(BcpWarningCode.INVALID_MOVEMENT_AMOUNT, report.warning_codes)

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


def page_metrics(*row_counts: int) -> tuple[BcpPageReadMetrics, ...]:
    return tuple(
        BcpPageReadMetrics(
            page=page,
            word_count=row_count * 6,
            row_count=row_count,
            table_top=Decimal("100"),
            table_bottom=Decimal("700"),
            header_detected=True,
            footer_detected=True,
        )
        for page, row_count in enumerate(row_counts, start=1)
    )


def report_with(*codes: BcpWarningCode) -> BcpValidationReport:
    return BcpValidationReport(
        status=ExtractionStatus.NEEDS_REVIEW if codes else ExtractionStatus.SUCCEEDED,
        checks=(),
        warning_codes=codes,
    )


class BcpIncompletePageTests(TestCase):
    """Dónde mirar cuando el banco declara más de lo que el PDF muestra."""

    def test_finds_the_intermediate_page_with_blank_gaps(self) -> None:
        # El caso real: 35 filas por página y una con 16 (huecos en blanco).
        metrics = page_metrics(20, 36, 36, 17, 36, 36, 9)

        self.assertEqual(find_sparse_pages(metrics), (4,))

    def test_first_and_last_pages_are_short_by_nature(self) -> None:
        # La primera lleva la cabecera y la última acaba con el mes.
        self.assertEqual(find_sparse_pages(page_metrics(3, 36, 36, 36, 2)), ())

    def test_pages_without_rows_at_the_ends_do_not_move_the_bounds(self) -> None:
        # Avisos o texto legal al principio o al final: la página 6 sigue siendo la
        # última con movimientos y es corta por naturaleza.
        self.assertEqual(find_sparse_pages(page_metrics(0, 20, 36, 36, 36, 9, 0, 0)), ())

    def test_a_blank_page_inside_the_table_is_incomplete(self) -> None:
        self.assertEqual(find_sparse_pages(page_metrics(20, 36, 36, 0, 36, 36, 9)), (4,))

    def test_a_slightly_shorter_page_is_not_incomplete(self) -> None:
        # Unas pocas filas menos son descripciones largas o un salto de página del banco.
        self.assertEqual(find_sparse_pages(page_metrics(20, 36, 30, 36, 36, 9)), ())

    def test_needs_enough_pages_to_know_what_is_usual(self) -> None:
        self.assertEqual(find_sparse_pages(page_metrics(20, 36, 10, 9)), ())
        self.assertEqual(find_sparse_pages(()), ())

    def test_flags_pages_only_when_the_bank_totals_do_not_reconcile(self) -> None:
        metrics = page_metrics(20, 36, 36, 17, 36, 36, 9)
        for code in (BcpWarningCode.DECLARED_TOTAL_MISMATCH, BcpWarningCode.BALANCE_MISMATCH):
            with self.subTest(code=code):
                flagged = flag_incomplete_pages(report_with(code), metrics)

                self.assertEqual(flagged.warning_codes, (code, BcpWarningCode.PAGE_INCOMPLETE))
                self.assertEqual(flagged.warning_pages, ((BcpWarningCode.PAGE_INCOMPLETE, 4),))
                self.assertEqual(flagged.status, ExtractionStatus.NEEDS_REVIEW)

    def test_a_short_page_that_reconciles_changes_nothing(self) -> None:
        # Con los totales cuadrando no falta nada: un documento correcto sigue correcto.
        metrics = page_metrics(20, 36, 36, 17, 36, 36, 9)
        for report in (
            report_with(),
            report_with(BcpWarningCode.UNCLASSIFIED_ROWS_PRESENT),
        ):
            with self.subTest(codes=report.warning_codes):
                self.assertIs(flag_incomplete_pages(report, metrics), report)

    def test_a_mismatch_without_short_pages_adds_nothing(self) -> None:
        report = report_with(BcpWarningCode.BALANCE_MISMATCH)

        self.assertIs(flag_incomplete_pages(report, page_metrics(20, 36, 36, 36, 9)), report)
