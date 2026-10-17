"""Cabecera y pie BBVA: cada dato por su rótulo, nada inventado."""

from __future__ import annotations

import tempfile
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest import TestCase

from statement_worker.domain.models import AccountType
from statement_worker.extractors.bbva.header import classify_account_type, read_bbva_header
from statement_worker.extractors.bbva.models import BbvaPageReadout, BbvaStatementHeader, BbvaWord
from statement_worker.extractors.bbva.pdfplumber_adapter import read_bbva_pdf
from tests.support.synthetic_bbva_pdf import SYNTHETIC_BBVA_HEADER, create_synthetic_bbva_pdf


def _row(top: int, *words: tuple[int, str]) -> tuple[BbvaWord, ...]:
    return tuple(
        BbvaWord(text, Decimal(x), Decimal(x + 6 * len(text)), Decimal(top)) for x, text in words
    )


class BbvaHeaderFromPdfTests(TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)

    def _read(self, **options: object) -> BbvaStatementHeader:
        path = self.root / "bbva.pdf"
        create_synthetic_bbva_pdf(path, **options)  # type: ignore[arg-type]
        read = read_bbva_pdf(path)
        return read_bbva_header(read.pages, page_width=read.probe.page_width)

    def test_reads_every_field_the_document_declares(self) -> None:
        header = self._read()

        for field, expected in SYNTHETIC_BBVA_HEADER.items():
            with self.subTest(field=field):
                self.assertEqual(getattr(header, field), expected)
        self.assertEqual(header.account_product, "CUENTA CORRIENTE")
        self.assertIs(header.account_type, AccountType.CHECKING)
        self.assertEqual(header.currency_label, "DOLARES US")
        self.assertEqual(header.statement_date, date(2026, 7, 31))
        # Dos páginas, con el correlativo que imprime cada una.
        self.assertEqual(header.sheets, "12-13")

    def test_a_savings_product_is_grouped_as_savings(self) -> None:
        header = self._read(account_product="CONTIAHORRO", currency="SOLES")

        self.assertEqual(header.account_product, "CONTIAHORRO")
        self.assertIs(header.account_type, AccountType.SAVINGS)
        self.assertEqual(header.currency_label, "SOLES")

    def test_a_missing_date_stays_empty(self) -> None:
        header = self._read(include_issue_date=False)

        self.assertIsNone(header.statement_date)
        # Sin fecha no hay dónde cortar la oficina: se deja vacía, no se adivina.
        self.assertEqual(header.office, "")
        self.assertEqual(header.account_code, SYNTHETIC_BBVA_HEADER["account_code"])


class BbvaHeaderLayoutTests(TestCase):
    def test_the_manager_is_split_by_column_even_on_the_address_line(self) -> None:
        rows = (
            _row(60, (41, "MOVIMIENTO"), (90, "Y"), (100, "SALDO")),
            _row(69, (41, "CUENTA"), (68, "CORRIENTE")),
            _row(78, (41, "TITULARES:"), (100, "PERSONA"), (150, "FICTICIA")),
            _row(87, (41, "CALLE"), (80, "UNO"), (426, "SU"), (440, "EJECUTIVO")),
            _row(96, (41, "PERU"), (389, "GESTOR"), (440, "FICTICIO")),
            _row(105, (40, "MONEDA:"), (70, "SOLES"), (214, "RUC:"), (240, "10000000001")),
            _row(120, (405, "CARGO/ABONO"), (477, "ITF")),
        )

        header = read_bbva_header((BbvaPageReadout(page=1, rows=rows, word_count=0),))

        self.assertEqual(header.holder, "PERSONA FICTICIA")
        self.assertEqual(header.address, "CALLE UNO, PERU")
        self.assertEqual(header.account_manager, "GESTOR FICTICIO")
        self.assertEqual(header.tax_id, "10000000001")
        self.assertEqual(header.currency_label, "SOLES")
        self.assertEqual(header.sheets, "")

    def test_a_tax_id_glued_to_its_label_is_still_read(self) -> None:
        rows = (
            _row(78, (41, "TITULARES:")),
            _row(87, (41, "PERSONA")),
            _row(96, (40, "MONEDA:"), (70, "DOLARES"), (110, "US"), (214, "RUC10000000001")),
        )

        header = read_bbva_header((BbvaPageReadout(page=1, rows=rows, word_count=0),))

        self.assertEqual(header.currency_label, "DOLARES US")
        self.assertEqual(header.tax_id, "10000000001")

    def test_without_labels_nothing_is_filled(self) -> None:
        rows = (_row(60, (41, "TEXTO"), (80, "SUELTO")),)

        header = read_bbva_header((BbvaPageReadout(page=1, rows=rows, word_count=2),))

        self.assertEqual(header.holder, "")
        self.assertEqual(header.interbank_code, "")
        self.assertIsNone(header.account_type)
        self.assertEqual(read_bbva_header(()).holder, "")

    def test_classifies_the_products_by_their_family(self) -> None:
        cases = {
            "CUENTA CORRIENTE": AccountType.CHECKING,
            "CTA. CTE. EMPRESAS": AccountType.CHECKING,
            "CONTIAHORRO": AccountType.SAVINGS,
            "Cuenta de Ahorros": AccountType.SAVINGS,
            "DEPOSITO A PLAZO": None,
            "": None,
        }
        for product, expected in cases.items():
            with self.subTest(product=product):
                self.assertIs(classify_account_type(product), expected)
