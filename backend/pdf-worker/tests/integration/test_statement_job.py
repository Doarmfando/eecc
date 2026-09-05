from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from uuid import uuid4

from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf

from statement_worker.domain.errors import InvalidPdfError, PdfSizeLimitError
from statement_worker.domain.models import Detection, ExtractionStatus
from statement_worker.extractors.registry import (
    DEFAULT_STRATEGY_ID,
    available_strategy_ids,
    resolve_strategy,
)
from statement_worker.services.statement_job import (
    ArtifactKind,
    StatementJobOptions,
    compute_job_id,
    read_job_manifest,
    run_statement_job,
)
from statement_worker.services.strategy import StatementOutcome


class _FailingStrategy:
    extractor_id = "test-failing-v1"
    extractor_version = "0.0.1"

    def process(
        self,
        pdf_path: Path,
        *,
        default_year: int | None = None,
        temporary_parent: Path | None = None,
    ) -> StatementOutcome:
        return StatementOutcome(
            detection=Detection(
                extractor_id=self.extractor_id,
                extractor_version="0.0.1",
                confidence=Decimal("0.9"),
            ),
            status=ExtractionStatus.FAILED,
            row_count=0,
            movement_count=0,
            page_count=1,
            warning_codes=("BCP_NO_ROWS",),
            check_codes=(("BCP_ROWS_PRESENT", "FAILED"),),
            plan=None,
        )


class StatementJobTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_statement_job_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.artifacts = self.directory / "artifacts"
        self.artifacts.mkdir()
        self.pdf_path = self.directory / "statement.pdf"
        create_synthetic_bcp_pdf(self.pdf_path)
        self.strategy = resolve_strategy()

    def test_registry_exposes_the_default_strategy(self) -> None:
        self.assertIn(DEFAULT_STRATEGY_ID, available_strategy_ids())
        self.assertEqual(self.strategy.extractor_id, DEFAULT_STRATEGY_ID)

    def test_job_publishes_every_requested_format(self) -> None:
        result = run_statement_job(
            self.pdf_path,
            strategy=self.strategy,
            artifact_root=self.artifacts,
            temporary_root=self.directory,
        )

        self.assertEqual(result.status, ExtractionStatus.SUCCEEDED)
        self.assertFalse(result.reused)
        self.assertEqual(len(result.job_id), 32)
        self.assertGreater(result.row_count, 0)
        self.assertEqual(result.movement_count, 1)
        self.assertEqual(result.page_count, 1)

        kinds = [artifact.kind for artifact in result.artifacts]
        self.assertEqual(kinds.count(ArtifactKind.XLSX), 1)
        self.assertEqual(kinds.count(ArtifactKind.CSV), 4)
        job_directory = self.artifacts / result.job_id
        for artifact in result.artifacts:
            with self.subTest(artifact=artifact.name):
                self.assertTrue((job_directory / artifact.name).is_file())
                self.assertGreater(artifact.byte_size, 0)
        self.assertTrue((job_directory / "result.json").is_file())

    def test_the_same_document_and_options_reuse_the_published_result(self) -> None:
        first = run_statement_job(
            self.pdf_path,
            strategy=self.strategy,
            artifact_root=self.artifacts,
            temporary_root=self.directory,
        )
        stamps = {
            path.name: path.stat().st_mtime_ns for path in (self.artifacts / first.job_id).iterdir()
        }

        second = run_statement_job(
            self.pdf_path,
            strategy=self.strategy,
            artifact_root=self.artifacts,
            temporary_root=self.directory,
        )

        self.assertTrue(second.reused)
        self.assertEqual(second.job_id, first.job_id)
        self.assertEqual(second.status, first.status)
        self.assertEqual(second.row_count, first.row_count)
        self.assertEqual(second.artifacts, first.artifacts)
        self.assertEqual(
            {
                path.name: path.stat().st_mtime_ns
                for path in (self.artifacts / first.job_id).iterdir()
            },
            stamps,
        )

    def test_different_options_produce_a_different_job(self) -> None:
        both = run_statement_job(
            self.pdf_path,
            strategy=self.strategy,
            artifact_root=self.artifacts,
            temporary_root=self.directory,
        )
        only_xlsx = run_statement_job(
            self.pdf_path,
            strategy=self.strategy,
            artifact_root=self.artifacts,
            options=StatementJobOptions(export_csv=False),
            temporary_root=self.directory,
        )

        self.assertNotEqual(both.job_id, only_xlsx.job_id)
        self.assertEqual(len(only_xlsx.artifacts), 1)
        self.assertEqual(only_xlsx.artifacts[0].kind, ArtifactKind.XLSX)

    def test_an_incomplete_job_directory_is_completed(self) -> None:
        result = run_statement_job(
            self.pdf_path,
            strategy=self.strategy,
            artifact_root=self.artifacts,
            temporary_root=self.directory,
        )
        job_directory = self.artifacts / result.job_id
        (job_directory / "result.json").unlink()

        completed = run_statement_job(
            self.pdf_path,
            strategy=self.strategy,
            artifact_root=self.artifacts,
            temporary_root=self.directory,
        )

        self.assertFalse(completed.reused)
        self.assertEqual(completed.job_id, result.job_id)
        # Los mismos artefactos, no los mismos bytes: openpyxl sella cada guardado con
        # el instante en que ocurre, así que el checksum de un XLSX reescrito cambia
        # aunque el contenido sea idéntico. Lo que el trabajo promete es qué publica.
        self.assertEqual(
            [(artifact.kind, artifact.name) for artifact in completed.artifacts],
            [(artifact.kind, artifact.name) for artifact in result.artifacts],
        )
        self.assertIsNotNone(read_job_manifest(job_directory))

    def test_a_failed_extraction_publishes_no_artifact_but_reports_codes(self) -> None:
        strategy = _FailingStrategy()

        result = run_statement_job(
            self.pdf_path,
            strategy=strategy,
            artifact_root=self.artifacts,
            temporary_root=self.directory,
        )

        self.assertEqual(result.status, ExtractionStatus.FAILED)
        self.assertEqual(result.artifacts, ())
        self.assertEqual(result.warning_codes, ("BCP_NO_ROWS",))
        job_directory = self.artifacts / result.job_id
        self.assertEqual(
            sorted(path.name for path in job_directory.iterdir()),
            ["result.json"],
        )
        reused = run_statement_job(
            self.pdf_path,
            strategy=strategy,
            artifact_root=self.artifacts,
            temporary_root=self.directory,
        )
        self.assertTrue(reused.reused)
        self.assertEqual(reused.status, ExtractionStatus.FAILED)

    def test_rejects_missing_files_and_oversized_documents(self) -> None:
        with self.assertRaises(InvalidPdfError):
            run_statement_job(
                self.directory / "missing.pdf",
                strategy=self.strategy,
                artifact_root=self.artifacts,
            )
        with self.assertRaises(PdfSizeLimitError):
            run_statement_job(
                self.pdf_path,
                strategy=self.strategy,
                artifact_root=self.artifacts,
                options=StatementJobOptions(max_bytes=1024),
            )

    def test_options_and_job_ids_are_validated(self) -> None:
        with self.assertRaises(ValueError):
            StatementJobOptions(export_xlsx=False, export_csv=False)
        with self.assertRaises(ValueError):
            StatementJobOptions(max_bytes=0)
        with self.assertRaises(ValueError):
            StatementJobOptions(default_year=1800)

        options = StatementJobOptions()
        self.assertEqual(
            compute_job_id(self.pdf_path, strategy=self.strategy, options=options),
            compute_job_id(self.pdf_path, strategy=self.strategy, options=options),
        )

    def test_a_corrupt_manifest_is_ignored_instead_of_trusted(self) -> None:
        result = run_statement_job(
            self.pdf_path,
            strategy=self.strategy,
            artifact_root=self.artifacts,
            temporary_root=self.directory,
        )
        job_directory = self.artifacts / result.job_id
        (job_directory / "result.json").write_text("{ no es json", encoding="utf-8")

        self.assertIsNone(read_job_manifest(job_directory))
        self.assertIsNone(read_job_manifest(self.artifacts / "inexistente"))

    def test_outcome_invariants_reject_inconsistent_reports(self) -> None:
        detection = Detection(
            extractor_id="test",
            extractor_version="0.0.1",
            confidence=Decimal("1"),
        )
        with self.assertRaises(ValueError):
            StatementOutcome(
                detection=detection,
                status=ExtractionStatus.SUCCEEDED,
                row_count=1,
                movement_count=2,
                page_count=1,
                warning_codes=(),
                check_codes=(),
                plan=None,
            )
        with self.assertRaises(ValueError):
            StatementOutcome(
                detection=detection,
                status=ExtractionStatus.SUCCEEDED,
                row_count=-1,
                movement_count=0,
                page_count=1,
                warning_codes=(),
                check_codes=(),
                plan=None,
            )


class EmptyStatementJobTests(TestCase):
    """Un estado de cuenta detectado pero sin filas no produce artefactos."""

    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_empty_job_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.artifacts = self.directory / "artifacts"
        self.artifacts.mkdir()
        self.pdf_path = self.directory / "empty.pdf"
        create_synthetic_bcp_pdf(self.pdf_path, include_movements=False)

    def test_a_statement_without_rows_fails_without_publishing(self) -> None:
        result = run_statement_job(
            self.pdf_path,
            strategy=resolve_strategy(),
            artifact_root=self.artifacts,
            temporary_root=self.directory,
        )

        self.assertEqual(result.status, ExtractionStatus.FAILED)
        self.assertEqual(result.row_count, 0)
        self.assertEqual(result.movement_count, 0)
        self.assertEqual(result.artifacts, ())
        self.assertIn(
            ("BCP_ROWS_PRESENT", "FAILED"),
            result.check_codes,
        )
        self.assertEqual(
            sorted(path.name for path in (self.artifacts / result.job_id).iterdir()),
            ["result.json"],
        )


class ArtifactChecksumTests(TestCase):
    """El consumidor debe poder verificar el artefacto sin reprocesarlo."""

    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_job_checksum_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.artifacts = self.directory / "artifacts"
        self.artifacts.mkdir()
        self.pdf_path = self.directory / "statement.pdf"
        create_synthetic_bcp_pdf(self.pdf_path)

    def test_every_artifact_reports_the_checksum_of_the_published_file(self) -> None:
        result = run_statement_job(
            self.pdf_path,
            strategy=resolve_strategy(),
            artifact_root=self.artifacts,
            temporary_root=self.directory,
        )
        job_directory = self.artifacts / result.job_id

        for artifact in result.artifacts:
            with self.subTest(artifact=artifact.name):
                content = (job_directory / artifact.name).read_bytes()
                self.assertEqual(artifact.checksum, sha256(content).hexdigest())
                self.assertEqual(artifact.byte_size, len(content))

        reused = run_statement_job(
            self.pdf_path,
            strategy=resolve_strategy(),
            artifact_root=self.artifacts,
            temporary_root=self.directory,
        )
        self.assertEqual(reused.artifacts, result.artifacts)


class ExtractorVersionTests(TestCase):
    """Cambiar las reglas de extracción debe producir un trabajo nuevo."""

    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_version_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.pdf_path = self.directory / "statement.pdf"
        create_synthetic_bcp_pdf(self.pdf_path)

    def test_the_job_identity_includes_the_extractor_version(self) -> None:
        options = StatementJobOptions()
        strategy = resolve_strategy()

        class NewerStrategy:
            extractor_id = strategy.extractor_id
            extractor_version = "99.0.0"

            def process(self, *args: object, **kwargs: object) -> StatementOutcome:
                raise AssertionError("no debe ejecutarse en esta prueba")

        current = compute_job_id(self.pdf_path, strategy=strategy, options=options)
        newer = compute_job_id(self.pdf_path, strategy=NewerStrategy(), options=options)

        self.assertNotEqual(current, newer)
