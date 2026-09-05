from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from uuid import uuid4

from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf

from statement_worker.config import WorkerSettings
from statement_worker.domain.errors import PdfSizeLimitError, UnsupportedDocumentError
from statement_worker.tasks import (
    PROCESS_STATEMENT_TASK,
    STATEMENT_QUEUE,
    build_celery_app,
    celery_app,
    process_statement,
    run_job_payload,
)


class CeleryTaskTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_celery_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.artifacts = self.directory / "artifacts"
        self.artifacts.mkdir()
        self.pdf_path = self.directory / "statement.pdf"
        create_synthetic_bcp_pdf(self.pdf_path)

        previous = celery_app.conf.task_always_eager
        celery_app.conf.task_always_eager = True
        self.addCleanup(setattr, celery_app.conf, "task_always_eager", previous)

    def test_the_application_declares_a_safe_internal_configuration(self) -> None:
        settings = WorkerSettings(
            celery_broker_url="redis://127.0.0.1:6379/9",
            celery_result_backend="redis://127.0.0.1:6379/10",
            celery_task_soft_time_limit_seconds=30,
            celery_task_time_limit_seconds=60,
        )

        application = build_celery_app(settings)

        self.assertEqual(application.conf.task_default_queue, STATEMENT_QUEUE)
        self.assertEqual(application.conf.accept_content, ["json"])
        self.assertEqual(application.conf.task_serializer, "json")
        self.assertTrue(application.conf.task_acks_late)
        self.assertEqual(application.conf.worker_prefetch_multiplier, 1)
        self.assertEqual(application.conf.task_soft_time_limit, 30)
        self.assertEqual(application.conf.task_time_limit, 60)
        self.assertEqual(application.conf.timezone, "UTC")

    def test_the_task_is_registered_under_its_stable_name(self) -> None:
        self.assertIn(PROCESS_STATEMENT_TASK, celery_app.tasks)

    def test_running_the_task_publishes_artifacts_and_returns_json_types(self) -> None:
        async_result = process_statement.delay(
            str(self.pdf_path),
            artifact_root=str(self.artifacts),
            temporary_root=str(self.directory),
        )
        payload = async_result.get()

        self.assertTrue(async_result.successful())
        self.assertEqual(payload["status"], "SUCCEEDED")
        self.assertEqual(len(payload["artifacts"]), 5)
        self.assertIsInstance(payload["job_id"], str)
        self.assertIsInstance(payload["row_count"], int)
        self.assertTrue(all(isinstance(code, str) for code in payload["warning_codes"]))
        self.assertTrue((self.artifacts / payload["job_id"] / "statement.xlsx").is_file())

    def test_repeating_the_task_reuses_the_published_job(self) -> None:
        first = run_job_payload(
            str(self.pdf_path),
            artifact_root=str(self.artifacts),
            temporary_root=str(self.directory),
        )
        second = run_job_payload(
            str(self.pdf_path),
            artifact_root=str(self.artifacts),
            temporary_root=str(self.directory),
        )

        self.assertFalse(first["reused"])
        self.assertTrue(second["reused"])
        self.assertEqual(first["job_id"], second["job_id"])

    def test_domain_failures_are_not_retried_as_transient(self) -> None:
        with self.assertRaises(UnsupportedDocumentError):
            run_job_payload(
                str(self.pdf_path),
                artifact_root=str(self.artifacts),
                extractor_id="banco-inexistente-v9",
            )
        with self.assertRaises(PdfSizeLimitError):
            run_job_payload(
                str(self.pdf_path),
                artifact_root=str(self.artifacts),
                max_bytes=1024,
            )
        self.assertEqual(list(self.artifacts.iterdir()), [])
