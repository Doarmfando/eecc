from datetime import date
from decimal import Decimal
from pathlib import Path
from shutil import rmtree
from typing import Any
from unittest import TestCase
from uuid import uuid4

from tests.support.synthetic_banco_nacion_pdf import create_synthetic_banco_nacion_pdf
from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf
from tests.support.synthetic_interbank_pdf import create_synthetic_interbank_pdf
from tests.support.synthetic_other_bank_pdf import create_synthetic_other_bank_pdf

from statement_worker.domain.errors import UnsupportedDocumentError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.exporters.workbook import SpreadsheetSheet, WorkbookPlan
from statement_worker.extractors.banco_nacion.strategy import BANCO_NACION_STRATEGY_ID
from statement_worker.extractors.bcp.strategy import BCP_STRATEGY_ID
from statement_worker.extractors.generic.strategy import GENERIC_STRATEGY_ID
from statement_worker.extractors.interbank.strategy import INTERBANK_STRATEGY_ID
from statement_worker.extractors.registry import (
    resolve_best_strategy,
    resolve_strategy,
    specialised_strategy_ids,
)
from statement_worker.services.statement_job import ArtifactKind, run_statement_job


def _sheet(plan: WorkbookPlan, name: str) -> SpreadsheetSheet:
    return next(sheet for sheet in plan.sheets if sheet.name == name)


def _movements(plan: WorkbookPlan) -> tuple[list[str], list[tuple[object, ...]]]:
    """Columnas y filas `MOVIMIENTO` de la hoja, sin saldos ni totales."""

    sheet = _sheet(plan, "Movimientos")
    keys = [column.key for column in sheet.columns]
    return keys, [row for row in sheet.rows if row[keys.index("type")] == "MOVIMIENTO"]


class BancoNacionStrategyTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_banco_nacion_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)

    def _statement(self, **options: bool) -> tuple[Path, Decimal]:
        path = self.directory / f"banco-nacion-{uuid4().hex}.pdf"
        closing = create_synthetic_banco_nacion_pdf(path, **options)
        return path, closing

    def _process(self, path: Path) -> Any:
        return resolve_strategy(BANCO_NACION_STRATEGY_ID).process(
            path, temporary_parent=self.directory
        )

    def test_reads_and_reconciles_a_multi_page_statement(self) -> None:
        path, closing = self._statement()

        outcome = self._process(path)

        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED)
        self.assertEqual(outcome.movement_count, 13)
        self.assertEqual(outcome.page_count, 3)
        self.assertEqual(outcome.warning_codes, ())
        self.assertEqual({status for _code, status in outcome.check_codes}, {"PASSED"})

        plan = outcome.plan
        assert plan is not None
        self.assertEqual(plan.schema_id, "eecc.statement.banco_nacion")
        self.assertEqual(
            [sheet.name for sheet in plan.sheets],
            ["Resumen", "Encabezado", "Movimientos", "Control_Paginas"],
        )
        summary_sheet = _sheet(plan, "Resumen")
        summary = dict(
            zip(
                (column.key for column in summary_sheet.columns),
                summary_sheet.rows[0],
                strict=True,
            )
        )
        self.assertEqual(summary["opening"], Decimal("1034.20"))
        self.assertEqual(summary["closing"], closing)
        self.assertEqual(summary["currency"], "PEN")
        keys, movements = _movements(plan)
        self.assertEqual(len(movements), 13)
        self.assertEqual(movements[-1][keys.index("balance")], closing)
        # Saldo anterior, arrastres entre páginas, totales y saldo final, con su tipo.
        types = [row[keys.index("type")] for row in _sheet(plan, "Movimientos").rows]
        self.assertEqual(types[0], "SALDO_ANTERIOR")
        self.assertIn("SALDO_ARRASTRADO", types)
        self.assertEqual(types[-2:], ["TOTAL_MOVIMIENTO", "SALDO"])
        self.assertEqual(summary["rows"], len(types))
        # `Cargo/Abono` con signo junto a las columnas separadas (ADR-0013).
        for row in movements:
            debit, credit = row[keys.index("debit")], row[keys.index("credit")]
            self.assertEqual(
                row[keys.index("signed_amount")], (credit or Decimal(0)) - (debit or Decimal(0))
            )
        self.assertTrue(
            all(
                isinstance(value, Decimal)
                for row in movements
                for key in ("signed_amount", "debit", "credit", "balance")
                if (value := row[keys.index(key)]) is not None
            )
        )

    def test_second_description_lines_join_their_movement_and_the_footer_does_not(self) -> None:
        path, _closing = self._statement()

        outcome = self._process(path)

        assert outcome.plan is not None
        keys, movements = _movements(outcome.plan)
        descriptions = [row[keys.index("description")] for row in movements]
        self.assertIn("TRANSF. RECIBIDA 000102 CLIENTE FICTICIO UNO", descriptions)
        self.assertFalse(
            any("Pagina" in text or "ficticio generado" in text for text in descriptions)
        )

    def test_short_dates_take_the_year_from_the_statement_period(self) -> None:
        path, _closing = self._statement(short_dates=True)

        outcome = self._process(path)

        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED)
        assert outcome.plan is not None
        keys, movements = _movements(outcome.plan)
        self.assertEqual(movements[0][keys.index("posting_date")], date(2026, 6, 2))

    def test_the_header_on_the_first_page_is_enough_for_the_whole_document(self) -> None:
        path, _closing = self._statement(repeat_header=False)

        outcome = self._process(path)

        self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED)
        self.assertEqual(outcome.movement_count, 13)

    def test_a_broken_balance_is_flagged_for_review(self) -> None:
        path, _closing = self._statement(broken_balance=True)

        outcome = self._process(path)

        self.assertEqual(outcome.status, ExtractionStatus.NEEDS_REVIEW)
        self.assertEqual(dict(outcome.check_codes)["BANCO_NACION_BALANCE_CONTINUITY"], "FAILED")

    def test_a_truncated_statement_is_flagged_for_review(self) -> None:
        path, _closing = self._statement(include_closing=False)

        outcome = self._process(path)

        self.assertEqual(outcome.status, ExtractionStatus.NEEDS_REVIEW)
        self.assertEqual(dict(outcome.check_codes)["BANCO_NACION_CLOSING_BALANCE"], "SKIPPED")

    def test_automatic_selection_picks_banco_nacion_and_keeps_the_others(self) -> None:
        path, _closing = self._statement()
        bcp = self.directory / "bcp.pdf"
        create_synthetic_bcp_pdf(bcp)
        interbank = self.directory / "interbank.pdf"
        create_synthetic_interbank_pdf(interbank)
        other = self.directory / "otro.pdf"
        create_synthetic_other_bank_pdf(other)

        self.assertIn(BANCO_NACION_STRATEGY_ID, specialised_strategy_ids())
        chosen = {
            name: resolve_best_strategy(pdf, temporary_parent=self.directory).extractor_id
            for name, pdf in (
                ("banco_nacion", path),
                ("bcp", bcp),
                ("interbank", interbank),
                ("otro", other),
            )
        }
        self.assertEqual(
            chosen,
            {
                "banco_nacion": BANCO_NACION_STRATEGY_ID,
                "bcp": BCP_STRATEGY_ID,
                "interbank": INTERBANK_STRATEGY_ID,
                "otro": GENERIC_STRATEGY_ID,
            },
        )

    def test_without_the_bank_name_the_template_is_not_claimed(self) -> None:
        path, _closing = self._statement(include_bank_name=False)

        with self.assertRaises(UnsupportedDocumentError):
            self._process(path)
        self.assertNotEqual(
            resolve_best_strategy(path, temporary_parent=self.directory).extractor_id,
            BANCO_NACION_STRATEGY_ID,
        )

    def test_no_specialised_strategy_claims_another_bank(self) -> None:
        path, _closing = self._statement()
        bcp = self.directory / "bcp.pdf"
        create_synthetic_bcp_pdf(bcp)
        interbank = self.directory / "interbank.pdf"
        create_synthetic_interbank_pdf(interbank)

        for other in (bcp, interbank):
            with self.assertRaises(UnsupportedDocumentError):
                self._process(other)
        for strategy_id in (BCP_STRATEGY_ID, INTERBANK_STRATEGY_ID):
            with self.assertRaises(UnsupportedDocumentError):
                resolve_strategy(strategy_id).process(path, temporary_parent=self.directory)

    def test_the_job_publishes_excel_and_one_csv_per_sheet(self) -> None:
        path, _closing = self._statement()
        artifacts = self.directory / "artifacts"
        artifacts.mkdir()

        result = run_statement_job(
            path,
            strategy=resolve_strategy(BANCO_NACION_STRATEGY_ID),
            artifact_root=artifacts,
            temporary_root=self.directory,
        )

        self.assertEqual(result.status, ExtractionStatus.SUCCEEDED)
        kinds = [artifact.kind for artifact in result.artifacts]
        self.assertEqual(kinds.count(ArtifactKind.XLSX), 1)
        self.assertEqual(kinds.count(ArtifactKind.CSV), 4)
