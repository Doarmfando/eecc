"""Procesar un documento no puede dejar sordo al servicio."""

import asyncio
from pathlib import Path
from shutil import rmtree
from threading import Event
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

from httpx import ASGITransport, AsyncClient
from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf

import statement_worker.api.app as api_app
from statement_worker.config import WorkerSettings

# Si el bucle de eventos quedara bloqueado, este plazo evita que la prueba cuelgue:
# se libera sola y falla por la comprobación, no por agotar el tiempo.
_BLOCK_SECONDS = 5.0
_ENTER_SECONDS = 15.0
_UPLOADS = 4


def _document_payload(pdf_path: Path) -> dict[str, tuple[str, bytes, str]]:
    return {"document": ("statement.pdf", pdf_path.read_bytes(), "application/pdf")}


class ApiResponsivenessTests(TestCase):
    """Un estado de cuenta real ocupa la CPU durante segundos; el resto debe seguir."""

    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_responsive_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.settings = WorkerSettings(
            artifact_root=self.directory / "artifacts",
            temporary_root=self.directory / "tmp",
            max_pdf_bytes=2 * 1024 * 1024,
        )
        self.pdf_path = self.directory / "statement.pdf"
        create_synthetic_bcp_pdf(self.pdf_path)

    def test_health_answers_while_a_document_is_being_processed(self) -> None:
        asyncio.run(self._health_during_processing())

    async def _health_during_processing(self) -> None:
        entered = Event()
        released = Event()
        real_processor = api_app._process_document

        def blocking_processor(*args: object, **kwargs: object) -> object:
            entered.set()
            released.wait(timeout=_BLOCK_SECONDS)
            return real_processor(*args, **kwargs)  # type: ignore[arg-type]

        transport = ASGITransport(app=api_app.create_app(self.settings))
        with patch.object(api_app, "_process_document", blocking_processor):
            async with AsyncClient(transport=transport, base_url="http://worker") as client:
                upload = asyncio.create_task(
                    client.post("/internal/statements", files=_document_payload(self.pdf_path))
                )
                await asyncio.to_thread(entered.wait, _ENTER_SECONDS)

                health = await client.get("/health")
                self.assertEqual(health.status_code, 200)
                self.assertFalse(
                    upload.done(),
                    "el servicio solo contestó cuando el documento ya había terminado",
                )

                released.set()
                response = await upload
                self.assertEqual(response.status_code, 200)


class DocumentConcurrencyLimitTests(TestCase):
    """Más documentos a la vez que núcleos disponibles perjudica a todos."""

    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_slots_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.pdf_path = self.directory / "statement.pdf"
        create_synthetic_bcp_pdf(self.pdf_path)

    def test_only_the_configured_number_of_documents_runs_at_once(self) -> None:
        asyncio.run(self._concurrent_uploads())

    async def _concurrent_uploads(self) -> None:
        settings = WorkerSettings(
            artifact_root=self.directory / "artifacts",
            temporary_root=self.directory / "tmp",
            max_pdf_bytes=2 * 1024 * 1024,
            max_concurrent_documents=1,
        )
        real_processor = api_app._process_document
        running = 0
        highest = 0

        def counting_processor(*args: object, **kwargs: object) -> object:
            nonlocal running, highest
            running += 1
            highest = max(highest, running)
            try:
                return real_processor(*args, **kwargs)  # type: ignore[arg-type]
            finally:
                running -= 1

        transport = ASGITransport(app=api_app.create_app(settings))
        with patch.object(api_app, "_process_document", counting_processor):
            async with AsyncClient(transport=transport, base_url="http://worker") as client:
                # Años distintos: cada envío es un trabajo nuevo. Reutilizar un
                # resultado ya publicado terminaría al instante y no probaría nada.
                statuses = await asyncio.gather(
                    *(
                        client.post(
                            "/internal/statements",
                            files=_document_payload(self.pdf_path),
                            data={"default_year": str(2020 + index)},
                        )
                        for index in range(_UPLOADS)
                    )
                )

        self.assertEqual([response.status_code for response in statuses], [200] * _UPLOADS)
        self.assertEqual(highest, 1)
