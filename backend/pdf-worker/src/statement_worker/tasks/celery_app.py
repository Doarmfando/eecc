"""Aplicación Celery interna del worker."""

from __future__ import annotations

from celery import Celery

from statement_worker.config import WorkerSettings, get_settings

CELERY_MAIN_NAME = "eecc_statement_worker"
STATEMENT_QUEUE = "statements"


def build_celery_app(settings: WorkerSettings | None = None) -> Celery:
    """Configura la cola interna; Redis y Celery no salen de este límite."""

    resolved = settings or get_settings()
    application = Celery(
        CELERY_MAIN_NAME,
        broker=resolved.celery_broker_url,
        backend=resolved.celery_result_backend,
        include=["statement_worker.tasks.statement_tasks"],
    )
    application.conf.update(
        task_default_queue=STATEMENT_QUEUE,
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        task_track_started=True,
        worker_prefetch_multiplier=1,
        task_soft_time_limit=resolved.celery_task_soft_time_limit_seconds,
        task_time_limit=resolved.celery_task_time_limit_seconds,
        result_expires=3600,
        broker_connection_retry_on_startup=True,
    )
    return application


celery_app = build_celery_app()
