"""Configuración tipada del worker; ningún valor sensible vive en el código."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from statement_worker.services.pdf_sanitizer import DEFAULT_MAX_PDF_BYTES

ENV_PREFIX = "EECC_WORKER_"


class WorkerSettings(BaseSettings):
    """Se lee del entorno o de un `.env` local; nunca de rutas fijas en el código."""

    model_config = SettingsConfigDict(
        env_prefix=ENV_PREFIX,
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    artifact_root: Path = Field(default=Path("artifacts"))
    temporary_root: Path | None = Field(default=None)
    max_pdf_bytes: int = Field(default=DEFAULT_MAX_PDF_BYTES, ge=1024, le=512 * 1024 * 1024)
    export_xlsx: bool = True
    export_csv: bool = True
    default_extractor_id: str | None = None

    # Cada documento largo reparte sus páginas entre varios procesos. Sin un tope,
    # varios documentos a la vez pedirían más núcleos de los que tiene la máquina y
    # todos irían más lentos; por encima del tope las peticiones esperan su turno.
    max_concurrent_documents: int = Field(default=2, ge=1, le=32)

    celery_broker_url: str = Field(default="redis://127.0.0.1:6379/0")
    celery_result_backend: str = Field(default="redis://127.0.0.1:6379/1")
    celery_task_soft_time_limit_seconds: int = Field(default=240, ge=1, le=3600)
    celery_task_time_limit_seconds: int = Field(default=300, ge=2, le=7200)
    celery_max_retries: int = Field(default=2, ge=0, le=10)

    @field_validator("celery_task_time_limit_seconds")
    @classmethod
    def _hard_limit_must_exceed_soft_limit(cls, value: int, info: object) -> int:
        data = getattr(info, "data", {})
        soft_limit = data.get("celery_task_soft_time_limit_seconds")
        if isinstance(soft_limit, int) and value <= soft_limit:
            raise ValueError("celery_task_time_limit_seconds must exceed the soft limit")
        return value

    def ensure_directories(self) -> None:
        """Crea los directorios configurados sin asumir rutas absolutas."""

        self.artifact_root.mkdir(parents=True, exist_ok=True)
        if self.temporary_root is not None:
            self.temporary_root.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> WorkerSettings:
    """Instancia única por proceso; las pruebas construyen la clase directamente."""

    return WorkerSettings()
