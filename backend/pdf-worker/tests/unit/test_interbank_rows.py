from datetime import date
from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.models import DocumentProbe, ExtractionStatus
from statement_worker.extractors.interbank.detector import InterbankTemplateDetector
from statement_worker.extractors.interbank.models import (
    InterbankPageReadout,
    InterbankParsedRow,
    InterbankRowType,
    InterbankWarningCode,
    InterbankWord,
)
from statement_worker.extractors.interbank.rows import detect_currency, read_interbank_rows
from statement_worker.extractors.interbank.validation import (
    InterbankCheckStatus,
    validate_interbank_rows,
)

# Posiciones horizontales aproximadas de cada columna en la plantilla.
_X = {"fecha": 50, "concepto": 120, "ingresos": 345, "gastos": 420, "saldo": 505}


def _row(top: int, *cells: tuple[str, str]) -> tuple[InterbankWord, ...]:
    """Una fila visual: cada celda es (columna, texto); el texto se parte en palabras."""

    words: list[InterbankWord] = []
    for column, text in cells:
        x = Decimal(_X[column])
        for part in text.split():
            width = Decimal(len(part) * 4)
            words.append(InterbankWord(text=part, x0=x, x1=x + width, top=Decimal(top)))
            x += width + Decimal(3)
    return tuple(words)


_HEADER = _row(
    100,
    ("fecha", "Fecha"),
    ("concepto", "Concepto"),
    ("ingresos", "Ingresos"),
    ("gastos", "Gastos"),
    ("saldo", "Saldo Contable"),
)


def _page(number: int, *rows: tuple[InterbankWord, ...]) -> InterbankPageReadout:
    return InterbankPageReadout(page=number, rows=rows, word_count=sum(len(row) for row in rows))


def _statement() -> tuple[InterbankPageReadout, ...]:
    return (
        _page(
            1,
            _row(40, ("fecha", "TITULAR FICTICIO")),
            _row(60, ("fecha", "Tu cuenta fue aperturada el 01/01/2020")),
            _HEADER,
            _row(130, ("fecha", "EMPEZASTE ABRIL CON"), ("saldo", "52.40")),
            _row(
                160,
                ("fecha", "02/05/2026"),
                ("concepto", "YAPE-A"),
                ("ingresos", "+120.00"),
                ("saldo", "172.40"),
            ),
            _row(
                190,
                ("fecha", "02/05/2026"),
                ("concepto", "TIENDA 305"),
                ("gastos", "-12.30"),
                ("saldo", "160.10"),
            ),
        ),
        _page(
            2,
            _HEADER,
            _row(
                130,
                ("fecha", "03/05/2026"),
                ("concepto", "I-BANC"),
                ("gastos", "-1,000.00"),
                ("saldo", "-839.90"),
            ),
            _row(
                160,
                ("fecha", "04/05/2026"),
                ("concepto", "PLIN-B"),
                ("ingresos", "+868.30"),
                ("saldo", "28.40"),
            ),
            _row(
                190,
                ("fecha", "SALDO CONTABLE AL 31/05"),
                ("ingresos", "+988.30"),
                ("gastos", "-1,012.30"),
                ("saldo", "28.40"),
            ),
        ),
        _page(3, _row(80, ("fecha", "Recuerda realiza tus consultas 24 horas"))),
        _page(
            4,
            _row(40, ("fecha", "Te ayudamos a conocer tu Estado de Cuenta")),
            _HEADER,
            _row(130, ("fecha", "EMPEZASTE OCTUBRE CON"), ("saldo", "1,234.56")),
            _row(
                160,
                ("fecha", "07/11/2019"),
                ("concepto", "TRANSFERENCIA"),
                ("ingresos", "+15.00"),
                ("saldo", "9,999.99"),
            ),
        ),
    )


class InterbankRowsTests(TestCase):
    def test_reads_opening_movements_and_closing_in_order(self) -> None:
        document = read_interbank_rows(_statement())

        self.assertEqual(
            [row.row_type for row in document.rows],
            [InterbankRowType.OPENING_BALANCE]
            + [InterbankRowType.MOVEMENT] * 4
            + [InterbankRowType.CLOSING_TOTALS],
        )
        self.assertEqual(document.warning_codes, ())

    def test_the_sign_decides_the_column_and_amounts_stay_decimal(self) -> None:
        movements = [
            row
            for row in read_interbank_rows(_statement()).rows
            if row.row_type is InterbankRowType.MOVEMENT
        ]

        self.assertEqual(movements[0].credit, Decimal("120.00"))
        self.assertIsNone(movements[0].debit)
        self.assertEqual(movements[1].debit, Decimal("12.30"))
        self.assertEqual(movements[1].posting_date, date(2026, 5, 2))
        # El número del concepto no se toma por importe.
        self.assertEqual(movements[1].description, "TIENDA 305")
        self.assertEqual(movements[2].debit, Decimal("1000.00"))
        # Un saldo negativo se conserva con su signo.
        self.assertEqual(movements[2].balance, Decimal("-839.90"))

    def test_ignores_everything_after_the_closing_row_including_the_guide_example(self) -> None:
        document = read_interbank_rows(_statement())

        self.assertTrue(all(row.page <= 2 for row in document.rows))
        self.assertEqual(len(document.page_metrics), 4)
        self.assertTrue(document.page_metrics[3].guide_page)

    def test_the_guide_page_is_skipped_even_without_a_closing_row(self) -> None:
        pages = _statement()
        truncated = (_page(2, *pages[1].rows[:-1]),)
        document = read_interbank_rows((pages[0], *truncated, pages[3]))

        self.assertFalse(any(row.balance == Decimal("1234.56") for row in document.rows))

    def test_a_detached_sign_is_joined_to_its_amount(self) -> None:
        sign = InterbankWord(text="+", x0=Decimal(340), x1=Decimal(344), top=Decimal(160))
        amount = InterbankWord(text="50.00", x0=Decimal(345), x1=Decimal(370), top=Decimal(160))
        row = (
            *_row(160, ("fecha", "02/05/2026"), ("concepto", "YAPE-A")),
            sign,
            amount,
            *_row(160, ("saldo", "102.40")),
        )
        document = read_interbank_rows(
            (
                _page(
                    1, _HEADER, _row(130, ("fecha", "EMPEZASTE ABRIL CON"), ("saldo", "52.40")), row
                ),
            )
        )

        self.assertEqual(document.rows[1].credit, Decimal("50.00"))

    def test_an_unsigned_amount_takes_the_column_under_which_it_sits(self) -> None:
        document = read_interbank_rows(
            (
                _page(
                    1,
                    _HEADER,
                    _row(
                        130,
                        ("fecha", "02/05/2026"),
                        ("concepto", "PAGO"),
                        ("gastos", "20.00"),
                        ("saldo", "80.00"),
                    ),
                    _row(
                        160,
                        ("fecha", "03/05/2026"),
                        ("concepto", "ABONO"),
                        ("ingresos", "5.00"),
                        ("saldo", "85.00"),
                    ),
                ),
            )
        )

        self.assertEqual(document.rows[0].debit, Decimal("20.00"))
        self.assertEqual(document.rows[1].credit, Decimal("5.00"))

    def test_an_unsigned_amount_without_header_is_not_guessed(self) -> None:
        document = read_interbank_rows(
            (
                _page(
                    1,
                    _row(
                        130,
                        ("fecha", "02/05/2026"),
                        ("concepto", "PAGO"),
                        ("gastos", "20.00"),
                        ("saldo", "80.00"),
                    ),
                ),
            )
        )

        self.assertEqual(document.rows, ())
        self.assertEqual(document.warning_codes, (InterbankWarningCode.AMOUNT_SIDE_UNKNOWN,))

    def test_a_row_with_amounts_that_matches_nothing_is_reported(self) -> None:
        document = read_interbank_rows(
            (
                _page(
                    1,
                    _HEADER,
                    _row(130, ("concepto", "AJUSTE"), ("gastos", "-3.00"), ("saldo", "1.00")),
                ),
            )
        )

        self.assertIn(InterbankWarningCode.ROW_UNCLASSIFIED, document.warning_codes)

    def test_currency_comes_from_the_account_title(self) -> None:
        self.assertEqual(detect_currency("ESTADO DE CUENTA CUENTA SIMPLE SOLES"), "PEN")
        self.assertEqual(detect_currency("Cuenta Simple Dólares"), "USD")
        self.assertIsNone(detect_currency("ESTADO DE CUENTA"))


class InterbankValidationTests(TestCase):
    def test_a_statement_that_reconciles_to_the_cent_succeeds(self) -> None:
        report = validate_interbank_rows(read_interbank_rows(_statement()).rows)

        self.assertEqual(report.status, ExtractionStatus.SUCCEEDED)
        self.assertTrue(all(check.status is InterbankCheckStatus.PASSED for check in report.checks))
        self.assertEqual(report.total_credits, Decimal("988.30"))
        self.assertEqual(report.total_debits, Decimal("1012.30"))

    def test_a_balance_that_does_not_follow_needs_review(self) -> None:
        rows = list(read_interbank_rows(_statement()).rows)
        broken = rows[2]
        rows[2] = InterbankParsedRow(
            row_type=broken.row_type,
            page=broken.page,
            description=broken.description,
            posting_date=broken.posting_date,
            debit=broken.debit,
            credit=broken.credit,
            balance=Decimal("135.90"),
        )

        report = validate_interbank_rows(tuple(rows))

        self.assertEqual(report.status, ExtractionStatus.NEEDS_REVIEW)
        checks = {check.code.value: check.status for check in report.checks}
        self.assertEqual(checks["INTERBANK_BALANCE_CONTINUITY"], InterbankCheckStatus.FAILED)

    def test_totals_that_disagree_with_the_movements_need_review(self) -> None:
        rows = [
            row
            for row in read_interbank_rows(_statement()).rows
            if not (row.row_type is InterbankRowType.MOVEMENT and row.credit == Decimal("868.30"))
        ]

        report = validate_interbank_rows(tuple(rows))

        checks = {check.code.value: check.status for check in report.checks}
        self.assertEqual(checks["INTERBANK_DECLARED_TOTALS"], InterbankCheckStatus.FAILED)
        self.assertEqual(report.status, ExtractionStatus.NEEDS_REVIEW)

    def test_without_closing_row_the_reading_cannot_be_proven(self) -> None:
        rows = tuple(
            row
            for row in read_interbank_rows(_statement()).rows
            if row.row_type is not InterbankRowType.CLOSING_TOTALS
        )

        report = validate_interbank_rows(rows)

        self.assertEqual(report.status, ExtractionStatus.NEEDS_REVIEW)

    def test_warnings_prevent_success(self) -> None:
        report = validate_interbank_rows(
            read_interbank_rows(_statement()).rows,
            warning_codes=(InterbankWarningCode.ROW_UNCLASSIFIED,),
        )

        self.assertEqual(report.status, ExtractionStatus.NEEDS_REVIEW)

    def test_a_month_without_movements_is_valid_when_opening_equals_closing(self) -> None:
        rows = (
            InterbankParsedRow(InterbankRowType.OPENING_BALANCE, 1, balance=Decimal("10.00")),
            InterbankParsedRow(
                InterbankRowType.CLOSING_TOTALS,
                1,
                debit=Decimal("0.00"),
                credit=Decimal("0.00"),
                balance=Decimal("10.00"),
            ),
        )

        self.assertEqual(validate_interbank_rows(rows).status, ExtractionStatus.SUCCEEDED)

    def test_nothing_read_fails(self) -> None:
        self.assertEqual(validate_interbank_rows(()).status, ExtractionStatus.FAILED)


class InterbankDetectorTests(TestCase):
    _FIRST_PAGE = (
        "ESTADO DE CUENTA CUENTA SIMPLE SOLES 000-0000000001 DEL 30 DE ABRIL AL 31 DE MAYO "
        "DETALLE DE MOVIMIENTOS Fecha Concepto Ingresos Gastos Saldo Contable "
        "EMPEZASTE ABRIL CON 52.40"
    )

    def test_recognises_the_template_without_the_bank_name(self) -> None:
        detection = InterbankTemplateDetector().detect(
            DocumentProbe(first_page_text=self._FIRST_PAGE)
        )

        self.assertGreaterEqual(detection.confidence, Decimal("0.75"))
        self.assertIn("OPENING_ROW_MATCH", detection.evidence_codes)
        self.assertNotIn("BANK_MARKER_INTERBANK", detection.evidence_codes)

    def test_the_same_column_names_alone_are_not_enough(self) -> None:
        probe = DocumentProbe(
            first_page_text=(
                "ESTADO DE CUENTA Fecha Concepto Ingresos Gastos Saldo Contable 01/05/2026"
            )
        )

        self.assertFalse(InterbankTemplateDetector().accepts(probe))

    def test_a_bcp_first_page_is_not_claimed(self) -> None:
        probe = DocumentProbe(
            first_page_text=(
                "BANCO DE CREDITO DEL PERU EXTRACTO DEL 01/06/2026 AL 30/06/2026 "
                "FECHA PROC FECHA VALOR DESCRIPCION CARGOS ABONOS SALDO 310-05529745-0-92"
            )
        )

        self.assertFalse(InterbankTemplateDetector().accepts(probe))
