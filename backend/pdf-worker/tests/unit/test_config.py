from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

from pydantic import ValidationError

from statement_worker.config import ENV_PREFIX, WorkerSettings, get_settings
from statement_worker.services.pdf_sanitizer import DEFAULT_MAX_PDF_BYTES


class WorkerSettingsTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_config_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        get_settings.cache_clear()
        self.addCleanup(get_settings.cache_clear)

    def test_defaults_are_conservative_and_carry_no_secrets(self) -> None:
        settings = WorkerSettings(_env_file=None)

        self.assertEqual(settings.max_pdf_bytes, DEFAULT_MAX_PDF_BYTES)
        self.assertTrue(settings.export_xlsx)
        self.assertTrue(settings.export_csv)
        self.assertIsNone(settings.default_extractor_id)
        self.assertIsNone(settings.temporary_root)
        for value in (settings.celery_broker_url, settings.celery_result_backend):
            with self.subTest(value=value):
                self.assertNotIn("@", value)
                self.assertTrue(value.startswith("redis://127.0.0.1"))

    def test_the_environment_overrides_every_documented_key(self) -> None:
        environment = {
            f"{ENV_PREFIX}ARTIFACT_ROOT": str(self.directory / "salida"),
            f"{ENV_PREFIX}TEMPORARY_ROOT": str(self.directory / "temporal"),
            f"{ENV_PREFIX}MAX_PDF_BYTES": "2048",
            f"{ENV_PREFIX}EXPORT_CSV": "false",
            f"{ENV_PREFIX}DEFAULT_EXTRACTOR_ID": "bcp-coordinate-v1",
            f"{ENV_PREFIX}CELERY_BROKER_URL": "redis://cola:6379/3",
        }
        with patch.dict("os.environ", environment, clear=False):
            get_settings.cache_clear()
            settings = get_settings()

        self.assertEqual(settings.artifact_root, self.directory / "salida")
        self.assertEqual(settings.temporary_root, self.directory / "temporal")
        self.assertEqual(settings.max_pdf_bytes, 2048)
        self.assertFalse(settings.export_csv)
        self.assertEqual(settings.default_extractor_id, "bcp-coordinate-v1")
        self.assertEqual(settings.celery_broker_url, "redis://cola:6379/3")
        self.assertIs(get_settings(), settings)

    def test_invalid_limits_are_rejected_at_load_time(self) -> None:
        for field, value in (
            ("max_pdf_bytes", 0),
            ("max_pdf_bytes", 1024 * 1024 * 1024),
            ("celery_task_soft_time_limit_seconds", 0),
        ):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                WorkerSettings(_env_file=None, **{field: value})

        with self.assertRaises(ValidationError):
            WorkerSettings(
                _env_file=None,
                celery_task_soft_time_limit_seconds=300,
                celery_task_time_limit_seconds=120,
            )

    def test_directories_are_created_on_demand(self) -> None:
        settings = WorkerSettings(
            _env_file=None,
            artifact_root=self.directory / "artefactos",
            temporary_root=self.directory / "temporal",
        )

        settings.ensure_directories()

        self.assertTrue(settings.artifact_root.is_dir())
        self.assertTrue(settings.temporary_root is not None)
        self.assertTrue((self.directory / "temporal").is_dir())

    def test_settings_are_immutable_once_loaded(self) -> None:
        settings = WorkerSettings(_env_file=None)

        with self.assertRaises(ValidationError):
            settings.max_pdf_bytes = 1024  # type: ignore[misc]
