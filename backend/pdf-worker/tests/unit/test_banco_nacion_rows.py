from datetime import date
from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.models import DocumentProbe, ExtractionStatus
from statement_worker.extractors.banco_nacion.detector import BancoNacionTemplateDetector
from statement_worker.extractors.banco_nacion.models import (
    BancoNacionPageReadout,
    BancoNacionParsedRow,
    BancoNacionRowType,
    BancoNacionWarningCode,
    BancoNacionWord,
)
from statement_worker.extractors.banco_nacion.rows import (
    detect_currency,
    read_banco_nacion_rows,
    statement_period,
)
from statement_worker.extractors.banco_nacion.validation import (
    BancoNacionCheckStatus,
    validate_banco_nacion_rows,
)

# Borde izquierdo de las columnas de texto y borde derecho de las de importes.
_LEFT = {"fecha": 40, "valor": 80, "descripcion": 125}
_RIGHT = {"cargos": 420, "abonos": 490, "saldo": 560, "importe": 460}


def _cell(top: int, column: str, text: str) -> list[BancoNacionWord]:
    parts = text.split()
    widths = [Decimal(len(part) * 4) for part in parts]
    if column in _RIGHT:
        x = Decimal(_RIGHT[column]) - sum(widths) - Decimal(3 * (len(parts) - 1))
    else:
        x = Decimal(_LEFT[column])
    words: list[BancoNacionWord] = []
    for part, width in zip(parts, widths, strict=True):
        words.append(BancoNacionWord(text=part, x0=x, x1=x + width, top=Decimal(top)))
        x += width + Decimal(3)
    return words


def _row(top: int, *cells: tuple[str, str]) -> tuple[BancoNacionWord, ...]:
    return tuple(word for column, text in cells for word in _cell(top, column, text))


def _page(number: int, *rows: tuple[BancoNacionWord, ...]) -> BancoNacionPageReadout:
    return BancoNacionPageReadout(page=number, rows=rows, word_count=sum(len(row) for row in rows))


_HEADER = _row(
    100,
    ("fecha", "FECHA"),
    ("descripcion", "DESCRIPCION"),
    ("cargos", "CARGOS"),
    ("abonos", "ABONOS"),
    ("saldo", "SALDO"),
)
_FIRST_PAGE = "BANCO DE LA NACION ESTADO DE CUENTA MONEDA: SOLES DEL 01/06/2026 AL 30/06/2026"


def _statement() -> tuple[BancoNacionPageReadout, ...]:
    return (
        _page(
            1,
            _row(40, ("fecha", "BANCO DE LA NACION")),
            _HEADER,
            _row(115, ("descripcion", "SALDO ANTERIOR"), ("saldo", "100.00")),
            _row(
                130,
                ("fecha", "02/06/2026"),
                ("descripcion", "DEPOSITO"),
                ("abonos", "50.00"),
                ("saldo", "150.00"),
            ),
            _row(
                145,
                ("fecha", "03/06/2026"),
                ("descripcion", "PAGO"),
                ("cargos", "200.00"),
                ("saldo", "50.00-"),
            ),
            _row(160, ("descripcion", "VAN"), ("saldo", "50.00-")),
        ),
        _page(
            2,
            _HEADER,
            _row(115, ("descripcion", "VIENEN"), ("saldo", "50.00-")),
            _row(
                130,
                ("fecha", "04/06/2026"),
                ("descripcion", "TRANSFERENCIA"),
                ("abonos", "1,000.00"),
                ("saldo", "950.00"),
            ),
            _row(145, ("descripcion", "TOTALES"), ("cargos", "200.00"), ("abonos", "1,050.00")),
            _row(160, ("descripcion", "SALDO FINAL"), ("saldo", "950.00")),
        ),
    )


def _types(rows: tuple[BancoNacionParsedRow, ...]) -> list[BancoNacionRowType]:
    return [row.row_type for row in rows]


class BancoNacionRowsTests(TestCase):
    def test_reads_movements_carries_totals_and_closing_in_order(self) -> None:
        document = read_banco_nacion_rows(_statement(), first_page_text=_FIRST_PAGE)

        self.assertEqual(
            _types(document.rows),
            [
                BancoNacionRowType.OPENING_BALANCE,
                BancoNacionRowType.MOVEMENT,
                BancoNacionRowType.MOVEMENT,
                BancoNacionRowType.CARRIED_BALANCE,
                BancoNacionRowType.CARRIED_BALANCE,
                BancoNacionRowType.MOVEMENT,
                BancoNacionRowType.DECLARED_TOTALS,
                BancoNacionRowType.CLOSING_BALANCE,
            ],
        )
        self.assertEqual(document.warning_codes, ())
        self.assertEqual(document.currency, "PEN")

    def test_amounts_take_the_column_under_which_they_are_printed(self) -> None:
        rows = read_banco_nacion_rows(_statement()).rows
        deposit, payment = rows[1], rows[2]

        self.assertEqual((deposit.credit, deposit.debit), (Decimal("50.00"), None))
        self.assertEqual((payment.debit, payment.credit), (Decimal("200.00"), None))
        # Un saldo en contra con el signo detrás se conserva negativo.
        self.assertEqual(payment.balance, Decimal("-50.00"))
        self.assertEqual(payment.posting_date, date(2026, 6, 3))

    def test_a_single_signed_amount_column_decides_by_its_sign(self) -> None:
        header = _row(
            100,
            ("fecha", "FECHA"),
            ("descripcion", "CONCEPTO"),
            ("importe", "IMPORTE"),
            ("saldo", "SALDO"),
        )
        document = read_banco_nacion_rows(
            (
                _page(
                    1,
                    header,
                    _row(
                        130,
                        ("fecha", "02/06/2026"),
                        ("descripcion", "COMPRA"),
                        ("importe", "-30.00"),
                        ("saldo", "70.00"),
                    ),
                    _row(
                        145,
                        ("fecha", "03/06/2026"),
                        ("descripcion", "ABONO"),
                        ("importe", "5.00"),
                        ("saldo", "75.00"),
                    ),
                ),
            )
        )

        self.assertEqual(document.rows[0].debit, Decimal("30.00"))
        self.assertEqual(document.rows[1].credit, Decimal("5.00"))

    def test_a_value_date_is_kept_apart_from_the_description(self) -> None:
        document = read_banco_nacion_rows(
            (
                _page(
                    1,
                    _HEADER,
                    _row(
                        130,
                        ("fecha", "02/06"),
                        ("valor", "03/06"),
                        ("descripcion", "DEPOSITO"),
                        ("abonos", "S/ 50.00"),
                        ("saldo", "150.00"),
                    ),
                ),
            ),
            first_page_text=_FIRST_PAGE,
        )

        movement = document.rows[0]
        self.assertEqual(movement.posting_date, date(2026, 6, 2))
        self.assertEqual(movement.value_date, date(2026, 6, 3))
        self.assertEqual(movement.description, "DEPOSITO")
        self.assertEqual(movement.credit, Decimal("50.00"))

    def test_a_summary_above_the_table_declares_opening_totals_and_closing(self) -> None:
        document = read_banco_nacion_rows(
            (
                _page(
                    1,
                    _row(
                        40,
                        ("fecha", "SALDO ANTERIOR: 100.00 TOTAL ABONOS: 50.00"),
                        ("saldo", "SALDO FINAL: 150.00"),
                    ),
                    _row(55, ("fecha", "TOTAL CARGOS: 0.00")),
                    _HEADER,
                    _row(
                        130,
                        ("fecha", "02/06/2026"),
                        ("descripcion", "DEPOSITO"),
                        ("abonos", "50.00"),
                        ("saldo", "150.00"),
                    ),
                ),
            )
        )

        report = validate_banco_nacion_rows(document.rows)

        self.assertEqual(report.status, ExtractionStatus.SUCCEEDED)
        self.assertEqual(report.opening_balance, Decimal("100.00"))
        self.assertEqual(report.closing_balance, Decimal("150.00"))

    def test_dates_without_year_and_without_period_are_not_guessed(self) -> None:
        document = read_banco_nacion_rows(
            (
                _page(
                    1,
                    _HEADER,
                    _row(
                        130,
                        ("fecha", "02/06"),
                        ("descripcion", "DEPOSITO"),
                        ("abonos", "50.00"),
                        ("saldo", "150.00"),
                    ),
                ),
            )
        )

        self.assertEqual(document.rows, ())
        self.assertEqual(document.warning_codes, (BancoNacionWarningCode.DATE_WITHOUT_YEAR,))

    def test_the_default_year_fills_in_when_there_is_no_period(self) -> None:
        document = read_banco_nacion_rows(
            (
                _page(
                    1,
                    _HEADER,
                    _row(
                        130,
                        ("fecha", "02-JUN"),
                        ("descripcion", "DEPOSITO"),
                        ("abonos", "50.00"),
                        ("saldo", "150.00"),
                    ),
                ),
            ),
            default_year=2025,
        )

        self.assertEqual(document.rows[0].posting_date, date(2025, 6, 2))

    def test_a_textual_date_with_its_own_year_ignores_the_default(self) -> None:
        document = read_banco_nacion_rows(
            (
                _page(
                    1,
                    _HEADER,
                    _row(
                        130,
                        ("fecha", "02JUN2026"),
                        ("descripcion", "DEPOSITO"),
                        ("abonos", "50.00"),
                        ("saldo", "150.00"),
                    ),
                ),
            ),
            default_year=2025,
        )

        self.assertEqual(document.rows[0].posting_date, date(2026, 6, 2))

    def test_without_header_only_explicitly_signed_amounts_are_read(self) -> None:
        document = read_banco_nacion_rows(
            (
                _page(
                    1,
                    _row(
                        130,
                        ("fecha", "02/06/2026"),
                        ("descripcion", "DEPOSITO"),
                        ("abonos", "+50.00"),
                        ("saldo", "150.00"),
                    ),
                    _row(
                        145,
                        ("fecha", "03/06/2026"),
                        ("descripcion", "PAGO"),
                        ("cargos", "20.00"),
                        ("saldo", "130.00"),
                    ),
                ),
            )
        )

        self.assertEqual(len(document.rows), 1)
        self.assertEqual(document.rows[0].credit, Decimal("50.00"))
        self.assertEqual(
            document.warning_codes,
            (BancoNacionWarningCode.HEADER_NOT_FOUND, BancoNacionWarningCode.AMOUNT_SIDE_UNKNOWN),
        )

    def test_a_row_with_amounts_that_matches_nothing_is_reported(self) -> None:
        document = read_banco_nacion_rows(
            (
                _page(
                    1,
                    _HEADER,
                    _row(130, ("descripcion", "AJUSTE"), ("cargos", "3.00"), ("saldo", "1.00")),
                    _row(145, ("fecha", "02/06/2026"), ("descripcion", "PAGO 10.00 REF 55")),
                ),
            )
        )

        self.assertEqual(document.warning_codes, (BancoNacionWarningCode.ROW_UNCLASSIFIED,))

    def test_currency_and_period_come_from_the_first_page(self) -> None:
        self.assertEqual(detect_currency("MONEDA: DOLARES AMERICANOS"), "USD")
        self.assertEqual(detect_currency("MONEDA: S/"), "PEN")
        self.assertIsNone(detect_currency("ESTADO DE CUENTA"))

        period = statement_period("PERIODO: 15/12/2025 - 14/01/2026")
        assert period is not None
        self.assertEqual((period.start, period.end), (date(2025, 12, 15), date(2026, 1, 14)))
        self.assertIsNone(statement_period("DEL 30/06/2026 AL 01/06/2026"))

    def test_a_period_across_new_year_places_each_month_in_its_year(self) -> None:
        document = read_banco_nacion_rows(
            (
                _page(
                    1,
                    _HEADER,
                    _row(
                        130,
                        ("fecha", "28/12"),
                        ("descripcion", "PAGO"),
                        ("cargos", "10.00"),
                        ("saldo", "90.00"),
                    ),
                    _row(
                        145,
                        ("fecha", "03/01"),
                        ("descripcion", "ABONO"),
                        ("abonos", "10.00"),
                        ("saldo", "100.00"),
                    ),
                ),
            ),
            first_page_text="DEL 15/12/2025 AL 14/01/2026",
        )

        self.assertEqual(
            [row.posting_date for row in document.rows], [date(2025, 12, 28), date(2026, 1, 3)]
        )


class BancoNacionValidationTests(TestCase):
    def test_a_statement_that_reconciles_to_the_cent_succeeds(self) -> None:
        report = validate_banco_nacion_rows(read_banco_nacion_rows(_statement()).rows)

        self.assertEqual(report.status, ExtractionStatus.SUCCEEDED)
        self.assertTrue(
            all(check.status is BancoNacionCheckStatus.PASSED for check in report.checks)
        )
        self.assertEqual(report.total_debits, Decimal("200.00"))
        self.assertEqual(report.total_credits, Decimal("1050.00"))

    def test_a_carried_balance_that_disagrees_breaks_continuity(self) -> None:
        rows = list(read_banco_nacion_rows(_statement()).rows)
        rows[4] = BancoNacionParsedRow(
            BancoNacionRowType.CARRIED_BALANCE, 2, "VIENEN", balance=Decimal("-40.00")
        )

        report = validate_banco_nacion_rows(tuple(rows))

        checks = {check.code.value: check.status for check in report.checks}
        self.assertEqual(checks["BANCO_NACION_BALANCE_CONTINUITY"], BancoNacionCheckStatus.FAILED)
        self.assertEqual(report.status, ExtractionStatus.NEEDS_REVIEW)

    def test_page_subtotals_are_accepted_alongside_the_document_total(self) -> None:
        rows = read_banco_nacion_rows(_statement()).rows
        subtotal = BancoNacionParsedRow(
            BancoNacionRowType.DECLARED_TOTALS,
            1,
            "TOTALES",
            debit=Decimal("200.00"),
            credit=Decimal("50.00"),
        )
        page_two = BancoNacionParsedRow(
            BancoNacionRowType.DECLARED_TOTALS, 2, "TOTALES", credit=Decimal("1000.00")
        )
        with_subtotals = (*rows[:3], subtotal, *rows[3:6], page_two, *rows[6:])

        self.assertEqual(
            validate_banco_nacion_rows(with_subtotals).status, ExtractionStatus.SUCCEEDED
        )

    def test_totals_that_disagree_with_the_movements_need_review(self) -> None:
        rows = list(read_banco_nacion_rows(_statement()).rows)
        rows[6] = BancoNacionParsedRow(
            BancoNacionRowType.DECLARED_TOTALS, 2, "TOTALES", debit=Decimal("210.00")
        )

        report = validate_banco_nacion_rows(tuple(rows))

        checks = {check.code.value: check.status for check in report.checks}
        self.assertEqual(checks["BANCO_NACION_DECLARED_TOTALS"], BancoNacionCheckStatus.FAILED)
        self.assertEqual(report.status, ExtractionStatus.NEEDS_REVIEW)

    def test_a_summary_closing_that_contradicts_the_table_needs_review(self) -> None:
        rows = read_banco_nacion_rows(_statement()).rows
        claim = BancoNacionParsedRow(
            BancoNacionRowType.CLOSING_BALANCE, 1, "SALDO FINAL", balance=Decimal("999.00")
        )

        report = validate_banco_nacion_rows((claim, *rows))

        checks = {check.code.value: check.status for check in report.checks}
        self.assertEqual(checks["BANCO_NACION_CLOSING_BALANCE"], BancoNacionCheckStatus.FAILED)

    def test_without_opening_the_reading_cannot_be_proven(self) -> None:
        rows = tuple(
            row
            for row in read_banco_nacion_rows(_statement()).rows
            if row.row_type is not BancoNacionRowType.OPENING_BALANCE
        )

        report = validate_banco_nacion_rows(rows)

        self.assertEqual(report.status, ExtractionStatus.NEEDS_REVIEW)

    def test_warnings_prevent_success(self) -> None:
        report = validate_banco_nacion_rows(
            read_banco_nacion_rows(_statement()).rows,
            warning_codes=(BancoNacionWarningCode.ROW_UNCLASSIFIED,),
        )

        self.assertEqual(report.status, ExtractionStatus.NEEDS_REVIEW)

    def test_a_month_without_movements_is_valid_when_opening_equals_closing(self) -> None:
        rows = (
            BancoNacionParsedRow(BancoNacionRowType.OPENING_BALANCE, 1, balance=Decimal("10.00")),
            BancoNacionParsedRow(BancoNacionRowType.CLOSING_BALANCE, 1, balance=Decimal("10.00")),
        )

        self.assertEqual(validate_banco_nacion_rows(rows).status, ExtractionStatus.SUCCEEDED)

    def test_nothing_read_fails(self) -> None:
        self.assertEqual(validate_banco_nacion_rows(()).status, ExtractionStatus.FAILED)


class BancoNacionDetectorTests(TestCase):
    def test_recognises_the_bank_and_its_movement_table(self) -> None:
        detection = BancoNacionTemplateDetector().detect(
            DocumentProbe(
                first_page_text=(
                    f"{_FIRST_PAGE} CUENTA: 00-000-000001 FECHA DESCRIPCION CARGOS ABONOS "
                    "SALDO SALDO ANTERIOR 100.00"
                )
            )
        )

        self.assertGreaterEqual(detection.confidence, Decimal("0.75"))
        self.assertIn("BANK_MARKER_BANCO_NACION", detection.evidence_codes)

    def test_the_same_table_without_the_bank_name_is_not_claimed(self) -> None:
        probe = DocumentProbe(
            first_page_text=(
                "ESTADO DE CUENTA CUENTA: 00-000-000001 DEL 01/06/2026 AL 30/06/2026 "
                "FECHA DESCRIPCION CARGOS ABONOS SALDO SALDO ANTERIOR 100.00"
            )
        )

        self.assertFalse(BancoNacionTemplateDetector().accepts(probe))

    def test_the_bank_name_in_passing_is_not_enough(self) -> None:
        probe = DocumentProbe(
            first_page_text="CONSTANCIA DE PAGO REALIZADO EN EL BANCO DE LA NACION"
        )

        self.assertFalse(BancoNacionTemplateDetector().accepts(probe))

    def test_a_bcp_first_page_is_not_claimed(self) -> None:
        probe = DocumentProbe(
            first_page_text=(
                "BANCO DE CREDITO DEL PERU EXTRACTO DEL 01/06/2026 AL 30/06/2026 "
                "FECHA PROC FECHA VALOR DESCRIPCION CARGOS ABONOS SALDO 310-05529745-0-92"
            )
        )

        self.assertFalse(BancoNacionTemplateDetector().accepts(probe))
