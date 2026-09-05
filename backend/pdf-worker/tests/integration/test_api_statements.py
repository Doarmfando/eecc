from hashlib import sha256
from importlib import import_module, reload
from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf
from tests.support.synthetic_other_bank_pdf import create_synthetic_other_bank_pdf

from statement_worker.api import API_TITLE, API_VERSION, create_app
from statement_worker.config import WorkerSettings, get_settings
from statement_worker.extractors.registry import DEFAULT_STRATEGY_ID


class InternalApiTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_api_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.settings = WorkerSettings(
            artifact_root=self.directory / "artifacts",
            temporary_root=self.directory / "tmp",
            max_pdf_bytes=2 * 1024 * 1024,
        )
        self.client = TestClient(create_app(self.settings))
        self.addCleanup(self.client.close)
        self.pdf_path = self.directory / "statement.pdf"
        create_synthetic_bcp_pdf(self.pdf_path)

    def _upload(self, content: bytes | None = None, **fields: object) -> object:
        payload = content if content is not None else self.pdf_path.read_bytes()
        return self.client.post(
            "/internal/statements",
            files={"document": ("statement.pdf", payload, "application/pdf")},
            data=fields,
        )

    def test_health_and_extractor_listing(self) -> None:
        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json(), {"status": "ok", "version": API_VERSION})

        extractors = self.client.get("/internal/extractors")
        self.assertEqual(extractors.status_code, 200)
        self.assertIn(DEFAULT_STRATEGY_ID, extractors.json()["extractors"])

    def test_processing_a_statement_returns_a_safe_payload(self) -> None:
        response = self._upload()

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "SUCCEEDED")
        self.assertEqual(payload["extractor_id"], DEFAULT_STRATEGY_ID)
        self.assertEqual(payload["movement_count"], 1)
        self.assertEqual(payload["page_count"], 1)
        self.assertFalse(payload["reused"])
        self.assertEqual(len(payload["artifacts"]), 5)
        self.assertTrue(all(check["status"] == "PASSED" for check in payload["checks"]))

        serialized = response.text
        for forbidden in ("SALDO ANTERIOR", "OPERACION SINTETICA", str(self.directory)):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, serialized)

        job_directory = self.settings.artifact_root / payload["job_id"]
        self.assertTrue((job_directory / "statement.xlsx").is_file())
        self.assertTrue((job_directory / "statement_Movimientos.csv").is_file())

    def test_discarding_a_job_removes_everything_it_published(self) -> None:
        payload = self._upload().json()
        job_id = payload["job_id"]
        job_directory = self.settings.artifact_root / job_id
        self.assertTrue(job_directory.is_dir())

        discarded = self.client.delete(f"/internal/statements/{job_id}")

        self.assertEqual(discarded.status_code, 204)
        self.assertFalse(job_directory.exists())
        artifact = self.client.get(f"/internal/statements/{job_id}/artifacts/statement.xlsx")
        self.assertEqual(artifact.status_code, 404)

    def test_discarding_is_idempotent_and_rejects_a_malformed_identifier(self) -> None:
        job_id = self._upload().json()["job_id"]
        self.assertEqual(self.client.delete(f"/internal/statements/{job_id}").status_code, 204)
        # Descartar dos veces responde igual: quien limpia no necesita saber si llegó tarde.
        self.assertEqual(self.client.delete(f"/internal/statements/{job_id}").status_code, 204)

        rejected = self.client.delete("/internal/statements/no-es-un-identificador")
        self.assertEqual(rejected.status_code, 404)
        self.assertEqual(rejected.json()["code"], "ARTIFACT_NOT_FOUND")

    def test_repeating_the_same_upload_reuses_the_job(self) -> None:
        first = self._upload().json()
        second = self._upload().json()

        self.assertEqual(second["job_id"], first["job_id"])
        self.assertFalse(first["reused"])
        self.assertTrue(second["reused"])

    def test_only_requested_formats_are_published(self) -> None:
        payload = self._upload(export_csv="false").json()

        self.assertEqual([artifact["kind"] for artifact in payload["artifacts"]], ["XLSX"])

    def test_temporary_uploads_are_always_removed(self) -> None:
        self._upload()

        self.assertEqual(list((self.directory / "tmp").glob("eecc_upload_*")), [])
        self.assertEqual(list((self.directory / "tmp").glob("eecc_job_*")), [])

    def test_rejects_documents_that_are_not_supported_statements(self) -> None:
        response = self._upload(b"%PDF-1.7 contenido que no es un estado de cuenta\n%%EOF")

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json(), {"code": "INVALID_PDF"})

    def test_rejects_an_empty_upload(self) -> None:
        response = self._upload(b"")

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json(), {"code": "INVALID_PDF"})

    def test_rejects_a_document_over_the_configured_limit(self) -> None:
        small_client = TestClient(
            create_app(
                WorkerSettings(
                    artifact_root=self.directory / "artifacts",
                    temporary_root=self.directory / "tmp",
                    max_pdf_bytes=1024,
                )
            )
        )
        self.addCleanup(small_client.close)

        response = small_client.post(
            "/internal/statements",
            files={
                "document": (
                    "statement.pdf",
                    self.pdf_path.read_bytes(),
                    "application/pdf",
                )
            },
        )

        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json(), {"code": "PDF_SIZE_LIMIT_EXCEEDED"})

    def test_rejects_an_unknown_extractor(self) -> None:
        response = self._upload(extractor_id="banco-inexistente-v9")

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json(), {"code": "UNSUPPORTED_DOCUMENT"})

    def test_rejects_a_request_without_any_output_format(self) -> None:
        response = self._upload(export_xlsx="false", export_csv="false")

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json(), {"code": "INVALID_JOB_OPTIONS"})


class AsgiEntryPointTests(TestCase):
    def test_the_module_level_application_is_built_from_the_environment(self) -> None:
        directory = Path.cwd() / f".test_asgi_{uuid4().hex}"
        directory.mkdir()
        self.addCleanup(rmtree, directory, True)

        with patch.dict(
            "os.environ",
            {"EECC_WORKER_ARTIFACT_ROOT": str(directory / "artifacts")},
            clear=False,
        ):
            get_settings.cache_clear()
            self.addCleanup(get_settings.cache_clear)
            module = import_module("statement_worker.api.main")
            application = reload(module).app

        self.assertEqual(application.title, API_TITLE)
        self.assertTrue((directory / "artifacts").is_dir())


class ArtifactDownloadTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_download_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.settings = WorkerSettings(
            artifact_root=self.directory / "artifacts",
            temporary_root=self.directory / "tmp",
        )
        self.client = TestClient(create_app(self.settings))
        self.addCleanup(self.client.close)
        pdf_path = self.directory / "statement.pdf"
        create_synthetic_bcp_pdf(pdf_path)
        response = self.client.post(
            "/internal/statements",
            files={"document": ("statement.pdf", pdf_path.read_bytes(), "application/pdf")},
        )
        self.payload = response.json()

    def test_serves_a_published_artifact_with_its_media_type(self) -> None:
        job_id = self.payload["job_id"]

        workbook = self.client.get(f"/internal/statements/{job_id}/artifacts/statement.xlsx")
        self.assertEqual(workbook.status_code, 200)
        self.assertEqual(
            workbook.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        self.assertEqual(
            sha256(workbook.content).hexdigest(),
            next(
                artifact["checksum"]
                for artifact in self.payload["artifacts"]
                if artifact["name"] == "statement.xlsx"
            ),
        )

        csv_file = self.client.get(
            f"/internal/statements/{job_id}/artifacts/statement_Movimientos.csv"
        )
        self.assertEqual(csv_file.status_code, 200)
        self.assertTrue(csv_file.headers["content-type"].startswith("text/csv"))

    def test_serves_only_what_the_manifest_declares(self) -> None:
        job_id = self.payload["job_id"]

        for name in ("result.json", "inexistente.xlsx", "..%2Fotro.xlsx"):
            with self.subTest(name=name):
                response = self.client.get(f"/internal/statements/{job_id}/artifacts/{name}")
                self.assertEqual(response.status_code, 404)

        unknown_job = self.client.get("/internal/statements/" + "0" * 32 + "/artifacts/x.xlsx")
        self.assertEqual(unknown_job.status_code, 404)
        self.assertEqual(unknown_job.json(), {"code": "ARTIFACT_NOT_FOUND"})

        malformed = self.client.get("/internal/statements/no-es-id/artifacts/statement.xlsx")
        self.assertEqual(malformed.status_code, 404)


class StrategySelectionApiTests(TestCase):
    """La API elige la estrategia según el documento cuando no se pide una."""

    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_seleccion_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.client = TestClient(
            create_app(
                WorkerSettings(
                    artifact_root=self.directory / "artifacts",
                    temporary_root=self.directory / "tmp",
                )
            )
        )
        self.addCleanup(self.client.close)

    def _upload(self, path: Path, **fields: object) -> object:
        return self.client.post(
            "/internal/statements",
            files={"document": (path.name, path.read_bytes(), "application/pdf")},
            data=fields,
        )

    def test_lists_which_extractors_are_specialised(self) -> None:
        payload = self.client.get("/internal/extractors").json()

        self.assertIn("bcp-coordinate-v1", payload["specialised"])
        self.assertIn("generic-table-v1", payload["extractors"])
        self.assertNotIn("generic-table-v1", payload["specialised"])

    def test_uses_the_specialised_strategy_for_a_bcp_statement(self) -> None:
        pdf = self.directory / "bcp.pdf"
        create_synthetic_bcp_pdf(pdf)

        payload = self._upload(pdf).json()

        self.assertEqual(payload["extractor_id"], "bcp-coordinate-v1")
        self.assertEqual(payload["status"], "SUCCEEDED")

    def test_falls_back_to_the_generic_strategy_for_another_bank(self) -> None:
        pdf = self.directory / "otro.pdf"
        create_synthetic_other_bank_pdf(pdf)

        payload = self._upload(pdf).json()

        self.assertEqual(payload["extractor_id"], "generic-table-v1")
        self.assertEqual(payload["movement_count"], 7)
        self.assertTrue(any(a["kind"] == "XLSX" for a in payload["artifacts"]))

    def test_still_rejects_a_document_that_is_not_a_statement(self) -> None:
        from reportlab.pdfgen.canvas import Canvas

        pdf = self.directory / "carta.pdf"
        canvas = Canvas(str(pdf), invariant=1)
        canvas.drawString(72, 720, "CARTA DE PRESENTACION")
        canvas.save()

        response = self._upload(pdf)

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json(), {"code": "UNSUPPORTED_DOCUMENT"})
