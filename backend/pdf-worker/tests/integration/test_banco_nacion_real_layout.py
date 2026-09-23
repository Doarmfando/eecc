"""La plantilla del Banco de la Nación tal como la imprime el banco.

Estas pruebas cubren lo que la primera versión del extractor —escrita sin ninguna
muestra delante— daba por supuesto y resultó falso al llegar un documento real:

- el documento **no nombra al banco** en ninguna parte;
- la fecha cierra la fila (columna `DIA`), no la abre;
- la columna de detalle se rotula `CODIFICACION`, sobre `NRO CHEQUE`;
- el saldo se imprime **una vez por día**, no en cada movimiento;
- el cierre va en dos líneas: rótulos arriba, importes alineados debajo;
- el saldo final lleva relleno de asteriscos (`*********12,345.67`).

El PDF es sintético y todos sus datos inventados; el documento real se comprueba
aparte, en `tests/characterization`.
"""

from __future__ import annotations

import tempfile
from decimal import Decimal
from pathlib import Path
from unittest import TestCase

from tests.support.synthetic_banco_nacion_pdf import (
    create_synthetic_banco_nacion_real_layout_pdf,
)
from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf
from tests.support.synthetic_interbank_pdf import create_synthetic_interbank_pdf

from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.banco_nacion.detector import BancoNacionTemplateDetector
from statement_worker.extractors.banco_nacion.strategy import BancoNacionStatementStrategy
from statement_worker.extractors.bcp.pdfplumber_adapter import probe_bcp_pdf_with_pdfplumber
from statement_worker.extractors.generic.strategy import GenericStatementStrategy
from statement_worker.extractors.registry import resolve_best_strategy


class BancoNacionRealLayoutTests(TestCase):
    def setUp(self) -> None:
        self._directory = tempfile.TemporaryDirectory()
        self.addCleanup(self._directory.cleanup)
        self.root = Path(self._directory.name)

    def _build(self, **options: object) -> tuple[Path, Decimal]:
        path = self.root / "banco-nacion.pdf"
        closing = create_synthetic_banco_nacion_real_layout_pdf(path, **options)  # type: ignore[arg-type]
        return path, closing

    def test_detects_the_template_although_it_never_names_the_bank(self) -> None:
        path, _closing = self._build()

        probe = probe_bcp_pdf_with_pdfplumber(path)
        detection = BancoNacionTemplateDetector().detect(probe)

        self.assertNotIn("BANK_MARKER_BANCO_NACION", detection.evidence_codes)
        self.assertIn("CODIFICACION_COLUMN_MATCH", detection.evidence_codes)
        self.assertIn("DAILY_BALANCE_COLUMN_MATCH", detection.evidence_codes)
        self.assertTrue(BancoNacionTemplateDetector().accepts(probe))

    def test_the_registry_prefers_it_over_the_generic_fallback(self) -> None:
        path, _closing = self._build()

        strategy = resolve_best_strategy(path)

        self.assertNotIsInstance(strategy, GenericStatementStrategy)
        self.assertIsInstance(strategy, BancoNacionStatementStrategy)

    def test_reconciles_with_a_balance_printed_once_per_day(self) -> None:
        path, closing = self._build()

        outcome = BancoNacionStatementStrategy().process(path)

        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED, outcome.check_codes)
        self.assertEqual(outcome.warning_codes, ())
        self.assertEqual(outcome.movement_count, 9)
        self.assertEqual({status for _code, status in outcome.check_codes}, {"PASSED"})
        self.assertIsNotNone(closing)

    def test_reads_the_closing_balance_through_its_protective_asterisks(self) -> None:
        con_relleno = BancoNacionStatementStrategy().process(self._build()[0])
        sin_relleno = BancoNacionStatementStrategy().process(self._build(asterisk_fill=False)[0])

        # El relleno es tipografía, no importe: las dos lecturas tienen que coincidir.
        self.assertEqual(con_relleno.status, sin_relleno.status)
        self.assertEqual(con_relleno.movement_count, sin_relleno.movement_count)
        self.assertEqual(con_relleno.check_codes, sin_relleno.check_codes)
        self.assertEqual(sin_relleno.status, ExtractionStatus.SUCCEEDED)

    def test_a_wrong_daily_balance_leaves_the_result_under_review(self) -> None:
        path, _closing = self._build(broken_daily_balance=True)

        outcome = BancoNacionStatementStrategy().process(path)

        self.assertEqual(outcome.status, ExtractionStatus.NEEDS_REVIEW)
        self.assertIn(
            ("BANCO_NACION_BALANCE_CONTINUITY", "FAILED"),
            outcome.check_codes,
        )

    def test_without_the_closing_block_nothing_is_taken_for_granted(self) -> None:
        path, _closing = self._build(include_closing=False)

        outcome = BancoNacionStatementStrategy().process(path)

        self.assertEqual(outcome.status, ExtractionStatus.NEEDS_REVIEW)

    def test_does_not_claim_statements_of_other_banks(self) -> None:
        otros = {
            "bcp.pdf": create_synthetic_bcp_pdf,
            "interbank.pdf": create_synthetic_interbank_pdf,
        }
        for nombre, build in otros.items():
            with self.subTest(documento=nombre):
                path = self.root / nombre
                build(path)

                aceptado = BancoNacionTemplateDetector().accepts(
                    probe_bcp_pdf_with_pdfplumber(path)
                )

                self.assertFalse(aceptado)
