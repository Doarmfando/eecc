"""La plantilla BBVA, de extremo a extremo sobre un PDF sintético.

Cubre lo que distingue a este banco de los demás del proyecto y lo que se
confirmó midiendo un documento real: una sola columna con signo, el ITF en
columna propia que descuenta del saldo, fechas sin año y un cierre que no imprime
saldo final. El documento real se comprueba aparte, en `tests/characterization`.
"""

from __future__ import annotations

import tempfile
from decimal import Decimal
from pathlib import Path
from unittest import TestCase

from tests.support.synthetic_banco_nacion_pdf import (
    create_synthetic_banco_nacion_real_layout_pdf,
)
from tests.support.synthetic_bbva_pdf import create_synthetic_bbva_pdf
from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf
from tests.support.synthetic_interbank_pdf import create_synthetic_interbank_pdf

from statement_worker.domain.errors import UnsupportedDocumentError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.bbva.detector import BbvaTemplateDetector
from statement_worker.extractors.bbva.models import BbvaRowType
from statement_worker.extractors.bbva.pdfplumber_adapter import read_bbva_pdf
from statement_worker.extractors.bbva.rows import read_bbva_rows
from statement_worker.extractors.bbva.strategy import BbvaStatementStrategy
from statement_worker.extractors.bcp.pdfplumber_adapter import probe_bcp_pdf_with_pdfplumber
from statement_worker.extractors.generic.strategy import GenericStatementStrategy
from statement_worker.extractors.registry import resolve_best_strategy


class BbvaStatementTests(TestCase):
    def setUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        self.addCleanup(self._directory.cleanup)
        self.root = Path(self._directory.name)

    def _build(self, **options: object) -> tuple[Path, Decimal]:
        path = self.root / "bbva.pdf"
        closing = create_synthetic_bbva_pdf(path, **options)  # type: ignore[arg-type]
        return path, closing

    def test_detects_the_template_by_its_columns(self) -> None:
        path, _closing = self._build()

        detection = BbvaTemplateDetector().detect(probe_bcp_pdf_with_pdfplumber(path))

        self.assertIn("SIGNED_AMOUNT_COLUMN_MATCH", detection.evidence_codes)
        self.assertIn("ITF_COLUMN_MATCH", detection.evidence_codes)
        self.assertIn("BOOK_BALANCE_COLUMN_MATCH", detection.evidence_codes)
        self.assertTrue(BbvaTemplateDetector().accepts(probe_bcp_pdf_with_pdfplumber(path)))

    def test_the_registry_prefers_it_over_the_generic_fallback(self) -> None:
        path, _closing = self._build()

        strategy = resolve_best_strategy(path)

        self.assertNotIsInstance(strategy, GenericStatementStrategy)
        self.assertIsInstance(strategy, BbvaStatementStrategy)

    def test_reconciles_discounting_the_itf_from_the_balance(self) -> None:
        path, closing = self._build()

        outcome = BbvaStatementStrategy().process(path)

        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED, outcome.check_codes)
        self.assertEqual(outcome.warning_codes, ())
        self.assertEqual(outcome.movement_count, 8)
        self.assertEqual({status for _code, status in outcome.check_codes}, {"PASSED"})
        self.assertGreater(closing, 0)

    def test_the_signed_column_decides_the_direction_of_each_movement(self) -> None:
        path, _closing = self._build()

        read = read_bbva_pdf(path)
        document = read_bbva_rows(read.pages, first_page_text=read.probe.first_page_text)
        movements = [row for row in document.rows if row.row_type is BbvaRowType.MOVEMENT]

        # El documento sintético trae seis cargos y dos abonos.
        self.assertEqual(sum(1 for row in movements if row.debit is not None), 6)
        self.assertEqual(sum(1 for row in movements if row.credit is not None), 2)

    def test_resolves_the_year_from_the_issue_date_in_the_footer(self) -> None:
        path, _closing = self._build()

        read = read_bbva_pdf(path)
        document = read_bbva_rows(read.pages, first_page_text=read.probe.first_page_text)
        movements = [row for row in document.rows if row.row_type is BbvaRowType.MOVEMENT]

        # Las fechas del documento son `dd-mm`; el año sale del pie, `31-07-2026`.
        self.assertTrue(all(row.posting_date is not None for row in movements))
        self.assertEqual({row.posting_date.year for row in movements if row.posting_date}, {2026})

    def test_without_a_year_anywhere_the_rows_are_flagged_instead_of_guessed(self) -> None:
        path, _closing = self._build(include_issue_date=False)

        read = read_bbva_pdf(path)
        document = read_bbva_rows(read.pages, first_page_text=read.probe.first_page_text)

        self.assertIn("BBVA_DATE_WITHOUT_YEAR", [code.value for code in document.warning_codes])

    def test_a_wrong_balance_leaves_the_result_under_review(self) -> None:
        path, _closing = self._build(broken_balance=True)

        outcome = BbvaStatementStrategy().process(path)

        self.assertEqual(outcome.status, ExtractionStatus.NEEDS_REVIEW)
        self.assertIn(("BBVA_BALANCE_CONTINUITY", "FAILED"), outcome.check_codes)

    def test_itf_totals_that_do_not_add_up_are_reported(self) -> None:
        path, _closing = self._build(wrong_itf_totals=True)

        outcome = BbvaStatementStrategy().process(path)

        self.assertEqual(outcome.status, ExtractionStatus.NEEDS_REVIEW)
        self.assertIn(("BBVA_ITF_TOTALS", "FAILED"), outcome.check_codes)

    def test_the_itf_block_is_optional(self) -> None:
        path, _closing = self._build(include_itf_totals=False)

        outcome = BbvaStatementStrategy().process(path)

        # Sin el bloque no hay nada que contrastar, pero el resto se demuestra igual.
        self.assertIn(("BBVA_ITF_TOTALS", "SKIPPED"), outcome.check_codes)
        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED, outcome.check_codes)

    def test_rejects_a_document_of_another_bank(self) -> None:
        otros = {
            "bcp.pdf": create_synthetic_bcp_pdf,
            "interbank.pdf": create_synthetic_interbank_pdf,
            "banco-nacion.pdf": create_synthetic_banco_nacion_real_layout_pdf,
        }
        for nombre, build in otros.items():
            with self.subTest(documento=nombre):
                path = self.root / nombre
                build(path)

                self.assertFalse(
                    BbvaTemplateDetector().accepts(probe_bcp_pdf_with_pdfplumber(path))
                )
                with self.assertRaises(UnsupportedDocumentError):
                    BbvaStatementStrategy().process(path)
