"""Tarea Celery que ejecuta un trabajo ya validado."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from statement_worker.config import get_settings
from statement_worker.extractors.registry import resolve_strategy
from statement_worker.services.statement_job import StatementJobOptions, run_statement_job

from .celery_app import celery_app

PROCESS_STATEMENT_TASK = "statement_worker.process_statement"


def run_job_payload(
    source_path: str,
    *,
    artifact_root: str,
    extractor_id: str | None = None,
    default_year: int | None = None,
    export_xlsx: bool = True,
    export_csv: bool = True,
    max_bytes: int | None = None,
    temporary_root: str | None = None,
) -> dict[str, Any]:
    """Cuerpo puro de la tarea, invocable sin Celery en las pruebas."""

    options_kwargs: dict[str, Any] = {
        "default_year": default_year,
        "export_xlsx": export_xlsx,
        "export_csv": export_csv,
    }
    if max_bytes is not None:
        options_kwargs["max_bytes"] = max_bytes

    result = run_statement_job(
        Path(source_path),
        strategy=resolve_strategy(extractor_id),
        artifact_root=Path(artifact_root),
        options=StatementJobOptions(**options_kwargs),
        temporary_root=Path(temporary_root) if temporary_root else None,
    )
    return result.as_payload()


@celery_app.task(
    name=PROCESS_STATEMENT_TASK,
    bind=True,
    autoretry_for=(OSError,),
    retry_backoff=True,
    retry_jitter=True,
)
def process_statement(self: Any, source_path: str, **options: Any) -> dict[str, Any]:
    """Adaptador de cola: traduce argumentos y delega en el servicio."""

    self.max_retries = get_settings().celery_max_retries
    return run_job_payload(source_path, **options)
