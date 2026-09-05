from decimal import Decimal
from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from uuid import uuid4

from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf
from tests.support.synthetic_other_bank_pdf import create_synthetic_other_bank_pdf

from statement_worker.domain.errors import UnsupportedDocumentError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.bcp.strategy import BCP_STRATEGY_ID
from statement_worker.extractors.generic.strategy import GENERIC_STRATEGY_ID
from statement_worker.extractors.registry import (
    resolve_best_strategy,
    resolve_strategy,
    specialised_strategy_ids,
)


class GenericStrategyTests(TestCase):
    """El respaldo debe leer otros bancos sin inventar la semántica de sus columnas."""

    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_generic_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)

    def _other_bank(self, *, include_headers: bool = True) -> Path:
        path = self.directory / f"otro-banco-{uuid4().hex}.pdf"
        create_synthetic_other_bank_pdf(path, include_headers=include_headers)
        return path

    def test_reads_another_bank_by_the_names_of_its_columns(self) -> None:
        outcome = resolve_strategy(GENERIC_STRATEGY_ID).process(
            self._other_bank(),
            temporary_parent=self.directory,
        )

        self.assertEqual(outcome.detection.extractor_id, GENERIC_STRATEGY_ID)
        self.assertEqual(outcome.row_count, 7)
        self.assertIsNotNone(outcome.plan)

    def test_declares_the_result_reconciled_only_when_the_balance_advances(self) -> None:
        outcome = resolve_strategy(GENERIC_STRATEGY_ID).process(
            self._other_bank(),
            temporary_parent=self.directory,
        )

        checks = dict(outcome.check_codes)
        self.assertEqual(checks["GENERIC_BALANCE_CONTINUITY"], "PASSED")
        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED)

    def test_reads_a_table_without_headers_when_the_arithmetic_proves_it(self) -> None:
        outcome = resolve_strategy(GENERIC_STRATEGY_ID).process(
            self._other_bank(include_headers=False),
            temporary_parent=self.directory,
        )

        # Sin rótulos no hay vocabulario, pero el saldo solo avanza de una manera.
        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED)
        self.assertEqual(outcome.row_count, 7)
        self.assertIn("GENERIC_COLUMNS_INFERRED", outcome.warning_codes)

    def test_refuses_when_neither_the_headers_ni_la_aritmetica_demuestran_nada(self) -> None:
        path = self.directory / f"sin-prueba-{uuid4().hex}.pdf"
        create_synthetic_other_bank_pdf(path, include_headers=False, broken_balance=True)

        outcome = resolve_strategy(GENERIC_STRATEGY_ID).process(
            path,
            temporary_parent=self.directory,
        )

        self.assertEqual(outcome.status, ExtractionStatus.FAILED)
        self.assertEqual(outcome.row_count, 0)
        self.assertIsNone(outcome.plan)
        self.assertIn("GENERIC_HEADER_NOT_RECOGNISED", outcome.warning_codes)

    def test_the_specialised_strategy_does_not_claim_another_bank(self) -> None:
        with self.assertRaises(UnsupportedDocumentError):
            resolve_strategy(BCP_STRATEGY_ID).process(
                self._other_bank(),
                temporary_parent=self.directory,
            )

    def test_selection_prefers_the_specialised_strategy(self) -> None:
        bcp_pdf = self.directory / "bcp.pdf"
        create_synthetic_bcp_pdf(bcp_pdf)

        chosen = resolve_best_strategy(bcp_pdf, temporary_parent=self.directory)

        self.assertEqual(chosen.extractor_id, BCP_STRATEGY_ID)
        self.assertIn(BCP_STRATEGY_ID, specialised_strategy_ids())
        self.assertNotIn(GENERIC_STRATEGY_ID, specialised_strategy_ids())

    def test_selection_falls_back_for_a_bank_without_template(self) -> None:
        chosen = resolve_best_strategy(self._other_bank(), temporary_parent=self.directory)

        self.assertEqual(chosen.extractor_id, GENERIC_STRATEGY_ID)

    def test_rejects_a_document_that_is_not_a_statement(self) -> None:
        from reportlab.pdfgen.canvas import Canvas

        path = self.directory / "carta.pdf"
        canvas = Canvas(str(path), invariant=1)
        canvas.drawString(72, 720, "CARTA DE PRESENTACION")
        canvas.drawString(72, 700, "Estimado cliente, adjuntamos la informacion solicitada.")
        canvas.save()

        # La selección delega en el respaldo, que necesita ver el documento entero
        # antes de decidir; el rechazo ocurre al procesarlo.
        chosen = resolve_best_strategy(path, temporary_parent=self.directory)

        self.assertEqual(chosen.extractor_id, GENERIC_STRATEGY_ID)
        with self.assertRaises(UnsupportedDocumentError):
            chosen.process(path, temporary_parent=self.directory)

    def test_the_published_plan_uses_its_own_schema(self) -> None:
        outcome = resolve_strategy(GENERIC_STRATEGY_ID).process(
            self._other_bank(),
            temporary_parent=self.directory,
        )

        plan = outcome.plan
        self.assertIsNotNone(plan)
        assert plan is not None
        self.assertEqual(plan.schema_id, "eecc.statement.generic")
        self.assertEqual(
            [sheet.name for sheet in plan.sheets], ["Resumen", "Movimientos", "Validaciones"]
        )

        movements = plan.sheets[1]
        self.assertEqual(len(movements.rows), 7)
        amounts = [value for row in movements.rows for value in row[5:8] if value is not None]
        self.assertTrue(all(isinstance(value, Decimal) for value in amounts))


class GenericInferenceStrategyTests(TestCase):
    """Un banco cuyos rótulos no están en ningún diccionario debe leerse igual."""

    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_inferencia_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)

    def test_reads_a_statement_whose_headers_are_in_another_language(self) -> None:
        path = self.directory / "banco-extranjero.pdf"
        create_synthetic_other_bank_pdf(path, foreign_headers=True)

        outcome = resolve_strategy(GENERIC_STRATEGY_ID).process(
            path,
            temporary_parent=self.directory,
        )

        self.assertEqual(outcome.row_count, 7)
        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED)
        self.assertIn("GENERIC_COLUMNS_INFERRED", outcome.warning_codes)
        checks = dict(outcome.check_codes)
        self.assertEqual(checks["GENERIC_BALANCE_CONTINUITY"], "PASSED")

    def test_the_automatic_selection_also_covers_it(self) -> None:
        path = self.directory / "banco-extranjero.pdf"
        create_synthetic_other_bank_pdf(path, foreign_headers=True)

        chosen = resolve_best_strategy(path, temporary_parent=self.directory)

        self.assertEqual(chosen.extractor_id, GENERIC_STRATEGY_ID)


class GenericMultiPageTests(TestCase):
    """El encabezado suele imprimirse solo en la primera página."""

    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_multipagina_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)

    def _statement(self, **options: object) -> Path:
        path = self.directory / f"multipagina-{uuid4().hex}.pdf"
        create_synthetic_other_bank_pdf(path, pages=3, **options)  # type: ignore[arg-type]
        return path

    def test_applies_the_header_of_the_first_page_to_the_rest(self) -> None:
        outcome = resolve_strategy(GENERIC_STRATEGY_ID).process(
            self._statement(),
            temporary_parent=self.directory,
        )

        self.assertEqual(outcome.page_count, 3)
        self.assertEqual(outcome.row_count, 7)
        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED)
        self.assertNotIn("GENERIC_COLUMNS_INFERRED", outcome.warning_codes)

    def test_infers_across_the_whole_document_when_there_is_no_header(self) -> None:
        outcome = resolve_strategy(GENERIC_STRATEGY_ID).process(
            self._statement(include_headers=False),
            temporary_parent=self.directory,
        )

        self.assertEqual(outcome.row_count, 7)
        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED)
        self.assertIn("GENERIC_COLUMNS_INFERRED", outcome.warning_codes)

    def test_the_balance_reconciles_across_page_boundaries(self) -> None:
        outcome = resolve_strategy(GENERIC_STRATEGY_ID).process(
            self._statement(foreign_headers=True),
            temporary_parent=self.directory,
        )

        checks = dict(outcome.check_codes)
        self.assertEqual(checks["GENERIC_BALANCE_CONTINUITY"], "PASSED")
        pages = {row[0] for row in (outcome.plan.sheets[1].rows if outcome.plan else ())}
        self.assertGreater(len(pages), 1)
