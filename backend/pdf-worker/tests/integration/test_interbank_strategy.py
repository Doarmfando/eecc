from decimal import Decimal
from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from uuid import uuid4

from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf
from tests.support.synthetic_interbank_pdf import create_synthetic_interbank_pdf
from tests.support.synthetic_other_bank_pdf import create_synthetic_other_bank_pdf

from statement_worker.domain.errors import UnsupportedDocumentError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.bcp.strategy import BCP_STRATEGY_ID
from statement_worker.extractors.generic.strategy import GENERIC_STRATEGY_ID
from statement_worker.extractors.interbank.strategy import INTERBANK_STRATEGY_ID
from statement_worker.extractors.registry import (
    resolve_best_strategy,
    resolve_strategy,
    specialised_strategy_ids,
)
from statement_worker.services.statement_job import ArtifactKind, run_statement_job


class InterbankStrategyTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_interbank_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)

    def _statement(self, **options: bool) -> tuple[Path, Decimal]:
        path = self.directory / f"interbank-{uuid4().hex}.pdf"
        closing = create_synthetic_interbank_pdf(path, **options)
        return path, closing

    def test_reads_and_reconciles_a_multi_page_statement(self) -> None:
        path, closing = self._statement()

        outcome = resolve_strategy(INTERBANK_STRATEGY_ID).process(
            path, temporary_parent=self.directory
        )

        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED)
        self.assertEqual(outcome.movement_count, 17)
        # Saldo inicial y cierre son filas, no movimientos.
        self.assertEqual(outcome.row_count, 19)
        self.assertEqual(outcome.page_count, 5)
        self.assertEqual(outcome.warning_codes, ())
        self.assertEqual({status for _code, status in outcome.check_codes}, {"PASSED"})

        plan = outcome.plan
        assert plan is not None
        self.assertEqual(plan.schema_id, "eecc.statement.interbank")
        self.assertEqual(
            [sheet.name for sheet in plan.sheets],
            ["Resumen", "Movimientos", "Control_Paginas", "Validaciones"],
        )
        summary = dict(
            zip(
                (column.key for column in plan.sheets[0].columns),
                plan.sheets[0].rows[0],
                strict=True,
            )
        )
        self.assertEqual(summary["closing"], closing)
        self.assertEqual(summary["currency"], "PEN")
        movements = plan.sheets[1].rows
        self.assertEqual(len(movements), 17)
        self.assertEqual(movements[-1][5], closing)
        self.assertTrue(
            all(
                isinstance(value, Decimal)
                for row in movements
                for value in row[3:6]
                if value is not None
            )
        )

    def test_the_guide_example_does_not_leak_into_the_movements(self) -> None:
        path, _closing = self._statement()

        outcome = resolve_strategy(INTERBANK_STRATEGY_ID).process(
            path, temporary_parent=self.directory
        )

        assert outcome.plan is not None
        years = {row[1].year for row in outcome.plan.sheets[1].rows}  # type: ignore[union-attr]
        self.assertEqual(years, {2026})

    def test_a_broken_balance_is_flagged_for_review(self) -> None:
        path, _closing = self._statement(broken_balance=True)

        outcome = resolve_strategy(INTERBANK_STRATEGY_ID).process(
            path, temporary_parent=self.directory
        )

        self.assertEqual(outcome.status, ExtractionStatus.NEEDS_REVIEW)
        self.assertEqual(dict(outcome.check_codes)["INTERBANK_BALANCE_CONTINUITY"], "FAILED")

    def test_a_truncated_statement_is_flagged_for_review(self) -> None:
        path, _closing = self._statement(include_closing=False)

        outcome = resolve_strategy(INTERBANK_STRATEGY_ID).process(
            path, temporary_parent=self.directory
        )

        self.assertEqual(outcome.status, ExtractionStatus.NEEDS_REVIEW)
        self.assertEqual(dict(outcome.check_codes)["INTERBANK_DECLARED_TOTALS"], "SKIPPED")

    def test_unsigned_amounts_are_placed_by_the_header_columns(self) -> None:
        path, _closing = self._statement(unsigned_amounts=True)

        outcome = resolve_strategy(INTERBANK_STRATEGY_ID).process(
            path, temporary_parent=self.directory
        )

        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED)

    def test_automatic_selection_picks_interbank_and_keeps_the_others(self) -> None:
        path, _closing = self._statement()
        bcp = self.directory / "bcp.pdf"
        create_synthetic_bcp_pdf(bcp)
        other = self.directory / "otro.pdf"
        create_synthetic_other_bank_pdf(other)

        self.assertIn(INTERBANK_STRATEGY_ID, specialised_strategy_ids())
        self.assertEqual(
            resolve_best_strategy(path, temporary_parent=self.directory).extractor_id,
            INTERBANK_STRATEGY_ID,
        )
        self.assertEqual(
            resolve_best_strategy(bcp, temporary_parent=self.directory).extractor_id,
            BCP_STRATEGY_ID,
        )
        self.assertEqual(
            resolve_best_strategy(other, temporary_parent=self.directory).extractor_id,
            GENERIC_STRATEGY_ID,
        )

    def test_neither_specialised_strategy_claims_the_other_bank(self) -> None:
        path, _closing = self._statement()
        bcp = self.directory / "bcp.pdf"
        create_synthetic_bcp_pdf(bcp)

        with self.assertRaises(UnsupportedDocumentError):
            resolve_strategy(INTERBANK_STRATEGY_ID).process(bcp, temporary_parent=self.directory)
        with self.assertRaises(UnsupportedDocumentError):
            resolve_strategy(BCP_STRATEGY_ID).process(path, temporary_parent=self.directory)

    def test_the_job_publishes_excel_and_one_csv_per_sheet(self) -> None:
        path, _closing = self._statement()
        artifacts = self.directory / "artifacts"
        artifacts.mkdir()

        result = run_statement_job(
            path,
            strategy=resolve_strategy(INTERBANK_STRATEGY_ID),
            artifact_root=artifacts,
            temporary_root=self.directory,
        )

        self.assertEqual(result.status, ExtractionStatus.SUCCEEDED)
        kinds = [artifact.kind for artifact in result.artifacts]
        self.assertEqual(kinds.count(ArtifactKind.XLSX), 1)
        self.assertEqual(kinds.count(ArtifactKind.CSV), 4)
