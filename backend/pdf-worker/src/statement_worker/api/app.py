"""API interna del worker: adaptador delgado sobre los servicios."""

from __future__ import annotations

from asyncio import Semaphore
from pathlib import Path
from shutil import rmtree
from tempfile import mkdtemp
from typing import Annotated, Any

from fastapi import APIRouter, FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from statement_worker.config import WorkerSettings, get_settings
from statement_worker.domain.errors import (
    ArtifactAlreadyExistsError,
    ArtifactNotFoundError,
    DomainError,
    InvalidPdfError,
    PdfSizeLimitError,
    UnsupportedDocumentError,
)
from statement_worker.extractors.registry import (
    available_strategy_ids,
    resolve_best_strategy,
    resolve_strategy,
    specialised_strategy_ids,
)
from statement_worker.services.statement_job import (
    StatementJobOptions,
    StatementJobResult,
    discard_published_job,
    resolve_published_artifact,
    run_statement_job,
)

# Códigos numéricos explícitos: los nombres de Starlette cambian entre versiones.
HTTP_OK = 200
HTTP_NO_CONTENT = 204
HTTP_BAD_REQUEST = 400
HTTP_CONFLICT = 409
HTTP_CONTENT_TOO_LARGE = 413
HTTP_NOT_FOUND = 404
HTTP_UNPROCESSABLE_CONTENT = 422

API_TITLE = "EECC statement worker (internal)"
API_VERSION = "0.1.0"
_UPLOAD_CHUNK_BYTES = 1024 * 1024
_MEDIA_TYPES = {
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv; charset=utf-8",
    ".json": "application/json",
}

_STATUS_BY_ERROR: dict[type[DomainError], int] = {
    InvalidPdfError: HTTP_UNPROCESSABLE_CONTENT,
    PdfSizeLimitError: HTTP_CONTENT_TOO_LARGE,
    UnsupportedDocumentError: HTTP_UNPROCESSABLE_CONTENT,
    ArtifactAlreadyExistsError: HTTP_CONFLICT,
    ArtifactNotFoundError: HTTP_NOT_FOUND,
}


def _error_response(error: DomainError) -> JSONResponse:
    """Solo códigos de dominio; nunca contenido del documento ni trazas."""

    http_status = _STATUS_BY_ERROR.get(type(error), HTTP_BAD_REQUEST)
    return JSONResponse(status_code=http_status, content={"code": error.code})


async def _store_upload(upload: UploadFile, destination: Path, *, max_bytes: int) -> None:
    written = 0
    with destination.open("wb") as handle:
        while True:
            chunk = await upload.read(_UPLOAD_CHUNK_BYTES)
            if not chunk:
                break
            written += len(chunk)
            if written > max_bytes:
                raise PdfSizeLimitError("The upload exceeds the configured size limit")
            handle.write(chunk)
    if written == 0:
        raise InvalidPdfError("The upload is empty")


def _process_document(
    stored: Path,
    *,
    requested: str | None,
    settings: WorkerSettings,
    options: StatementJobOptions,
) -> StatementJobResult:
    """Todo el trabajo bloqueante de un documento, aislado del bucle de eventos."""

    # Sin estrategia pedida, el documento decide: primero las plantillas
    # conocidas y solo después el respaldo genérico.
    strategy = (
        resolve_strategy(requested)
        if requested
        else resolve_best_strategy(stored, temporary_parent=settings.temporary_root)
    )
    return run_statement_job(
        stored,
        strategy=strategy,
        artifact_root=settings.artifact_root,
        options=options,
        temporary_root=settings.temporary_root,
    )


def create_app(settings: WorkerSettings | None = None) -> FastAPI:
    """Construye la aplicación con la configuración inyectada."""

    resolved_settings = settings or get_settings()
    resolved_settings.ensure_directories()

    application = FastAPI(title=API_TITLE, version=API_VERSION)
    application.state.settings = resolved_settings
    application.state.document_slots = Semaphore(resolved_settings.max_concurrent_documents)
    application.include_router(_build_router())

    @application.exception_handler(DomainError)
    async def _domain_error_handler(_request: Request, error: Exception) -> JSONResponse:
        assert isinstance(error, DomainError)
        return _error_response(error)

    return application


def _build_router() -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "version": API_VERSION}

    @router.get("/internal/extractors")
    def extractors() -> dict[str, Any]:
        return {
            "extractors": list(available_strategy_ids()),
            "specialised": list(specialised_strategy_ids()),
        }

    @router.post("/internal/statements", status_code=HTTP_OK)
    async def process_statement(
        request: Request,
        document: Annotated[UploadFile, File(description="Estado de cuenta en PDF")],
        extractor_id: Annotated[str | None, Form()] = None,
        default_year: Annotated[int | None, Form()] = None,
        export_xlsx: Annotated[bool, Form()] = True,
        export_csv: Annotated[bool, Form()] = True,
    ) -> JSONResponse:
        settings: WorkerSettings = request.app.state.settings
        try:
            options = StatementJobOptions(
                default_year=default_year,
                export_xlsx=export_xlsx,
                export_csv=export_csv,
                max_bytes=settings.max_pdf_bytes,
            )
        except ValueError:
            return JSONResponse(
                status_code=HTTP_UNPROCESSABLE_CONTENT,
                content={"code": "INVALID_JOB_OPTIONS"},
            )

        requested = extractor_id or settings.default_extractor_id
        upload_directory = Path(mkdtemp(prefix="eecc_upload_", dir=settings.temporary_root))
        slots: Semaphore = request.app.state.document_slots
        try:
            stored = upload_directory / "upload.pdf"
            await _store_upload(document, stored, max_bytes=settings.max_pdf_bytes)
            # Un estado de cuenta real ocupa la CPU durante segundos. Fuera del bucle
            # de eventos, para que el servicio siga respondiendo mientras trabaja.
            async with slots:
                result = await run_in_threadpool(
                    _process_document,
                    stored,
                    requested=requested,
                    settings=settings,
                    options=options,
                )
        finally:
            rmtree(upload_directory, ignore_errors=True)

        return JSONResponse(status_code=HTTP_OK, content=result.as_payload())

    @router.get("/internal/statements/{job_id}/artifacts/{name}")
    def download_artifact(request: Request, job_id: str, name: str) -> FileResponse:
        """Sirve un archivo ya publicado; el manifiesto decide qué es servible."""

        settings: WorkerSettings = request.app.state.settings
        path = resolve_published_artifact(settings.artifact_root, job_id, name)
        media_type = _MEDIA_TYPES.get(path.suffix, "application/octet-stream")
        return FileResponse(path, media_type=media_type, filename=path.name)

    @router.delete("/internal/statements/{job_id}", status_code=HTTP_NO_CONTENT)
    def discard_statement(request: Request, job_id: str) -> Response:
        """Borra los artefactos del trabajo. Para quien ya se los llevó y no quiere copia.

        Idempotente a propósito: descartar dos veces responde igual que descartar una.
        """

        settings: WorkerSettings = request.app.state.settings
        discard_published_job(settings.artifact_root, job_id)
        return Response(status_code=HTTP_NO_CONTENT)

    return router
