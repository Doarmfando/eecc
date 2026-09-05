"""Orquestación de un trabajo: extraer, exportar y publicar sin conocer bancos."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from enum import StrEnum
from hashlib import sha256
from pathlib import Path
from shutil import rmtree
from tempfile import mkdtemp
from typing import Any

from statement_worker.domain.errors import (
    ArtifactNotFoundError,
    ArtifactPublicationError,
    InvalidPdfError,
    PdfSizeLimitError,
)
from statement_worker.domain.models import ExtractionStatus
from statement_worker.exporters.csv_export import export_csv_bundle
from statement_worker.exporters.workbook import WorkbookPlan
from statement_worker.exporters.xlsx_writer import export_workbook_plan

from .atomic_artifact import publish_artifact_atomically
from .pdf_sanitizer import DEFAULT_MAX_PDF_BYTES
from .strategy import StatementStrategy

JOB_ID_LENGTH = 32
JOB_MANIFEST_NAME = "result.json"
JOB_MANIFEST_SCHEMA = "eecc.job.result"
JOB_MANIFEST_VERSION = 1

_ARTIFACT_STEM = "statement"


class ArtifactKind(StrEnum):
    XLSX = "XLSX"
    CSV = "CSV"


@dataclass(frozen=True, slots=True)
class StatementJobOptions:
    default_year: int | None = None
    export_xlsx: bool = True
    export_csv: bool = True
    max_bytes: int = DEFAULT_MAX_PDF_BYTES

    def __post_init__(self) -> None:
        if not self.export_xlsx and not self.export_csv:
            raise ValueError("a job must produce at least one artifact format")
        if self.max_bytes < 1:
            raise ValueError("max_bytes must be positive")
        if self.default_year is not None and not 1900 <= self.default_year <= 2999:
            raise ValueError("default_year is out of the supported range")

    @property
    def fingerprint(self) -> str:
        return "|".join(
            (
                str(self.default_year or ""),
                "xlsx" if self.export_xlsx else "",
                "csv" if self.export_csv else "",
            )
        )


@dataclass(frozen=True, slots=True)
class ArtifactRecord:
    kind: ArtifactKind
    name: str
    byte_size: int
    checksum: str


@dataclass(frozen=True, slots=True)
class StatementJobResult:
    """Payload seguro: identificadores, códigos y conteos, nunca contenido."""

    job_id: str
    extractor_id: str
    extractor_version: str
    status: ExtractionStatus
    row_count: int
    movement_count: int
    page_count: int
    warning_codes: tuple[str, ...]
    check_codes: tuple[tuple[str, str], ...]
    artifacts: tuple[ArtifactRecord, ...]
    reused: bool = False

    def as_payload(self) -> dict[str, Any]:
        """Representación serializable para HTTP o una cola."""

        return {
            "job_id": self.job_id,
            "extractor_id": self.extractor_id,
            "extractor_version": self.extractor_version,
            "status": self.status.value,
            "row_count": self.row_count,
            "movement_count": self.movement_count,
            "page_count": self.page_count,
            "warning_codes": list(self.warning_codes),
            "checks": [{"code": code, "status": status} for code, status in self.check_codes],
            "artifacts": [
                {
                    "kind": artifact.kind.value,
                    "name": artifact.name,
                    "byte_size": artifact.byte_size,
                    "checksum": artifact.checksum,
                }
                for artifact in self.artifacts
            ],
            "reused": self.reused,
        }


def _result_from_payload(payload: dict[str, Any], *, reused: bool) -> StatementJobResult:
    return StatementJobResult(
        job_id=str(payload["job_id"]),
        extractor_id=str(payload["extractor_id"]),
        extractor_version=str(payload["extractor_version"]),
        status=ExtractionStatus(str(payload["status"])),
        row_count=int(payload["row_count"]),
        movement_count=int(payload["movement_count"]),
        page_count=int(payload["page_count"]),
        warning_codes=tuple(str(code) for code in payload["warning_codes"]),
        check_codes=tuple(
            (str(check["code"]), str(check["status"])) for check in payload["checks"]
        ),
        artifacts=tuple(
            ArtifactRecord(
                kind=ArtifactKind(str(artifact["kind"])),
                name=str(artifact["name"]),
                byte_size=int(artifact["byte_size"]),
                checksum=str(artifact["checksum"]),
            )
            for artifact in payload["artifacts"]
        ),
        reused=reused,
    )


def compute_job_id(
    source: Path,
    *,
    strategy: StatementStrategy,
    options: StatementJobOptions,
) -> str:
    """Clave idempotente derivada del contenido, la estrategia y las opciones."""

    digest = sha256()
    digest.update(strategy.extractor_id.encode("utf-8"))
    digest.update(b"\x00")
    # Cambiar las reglas de extracción cambia el resultado: la versión forma parte de
    # la identidad para no devolver una lectura hecha con el código anterior.
    digest.update(strategy.extractor_version.encode("utf-8"))
    digest.update(b"\x00")
    digest.update(options.fingerprint.encode("utf-8"))
    digest.update(b"\x00")
    with source.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()[:JOB_ID_LENGTH]


def read_job_manifest(job_directory: Path) -> StatementJobResult | None:
    """Devuelve el resultado publicado antes, o `None` si el trabajo no terminó."""

    manifest_path = job_directory / JOB_MANIFEST_NAME
    if not manifest_path.is_file():
        return None
    try:
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
        payload = document["result"]
        if document["schema"] != JOB_MANIFEST_SCHEMA:
            return None
        return _result_from_payload(payload, reused=True)
    except (OSError, ValueError, KeyError, TypeError):
        return None


JOB_ID_PATTERN = re.compile(rf"^[0-9a-f]{{{JOB_ID_LENGTH}}}$")


def resolve_published_artifact(artifact_root: Path, job_id: str, name: str) -> Path:
    """Resuelve un artefacto solo si el manifiesto del trabajo lo declara.

    El manifiesto es la lista blanca: ningún nombre construido por el llamador
    puede salir del directorio del trabajo ni alcanzar un archivo no publicado.
    """

    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ArtifactNotFoundError("The job identifier is not valid")

    job_directory = artifact_root / job_id
    manifest = read_job_manifest(job_directory)
    if manifest is None:
        raise ArtifactNotFoundError("The job has no published manifest")
    if not any(artifact.name == name for artifact in manifest.artifacts):
        raise ArtifactNotFoundError("The job did not publish that artifact")

    candidate = job_directory / name
    if not candidate.is_file():
        raise ArtifactNotFoundError("The published artifact is missing from disk")
    return candidate


def discard_published_job(artifact_root: Path, job_id: str) -> bool:
    """Borra del disco todo lo publicado por un trabajo.

    Lo usa quien ya se llevó los artefactos y no quiere que quede copia aquí. Es
    idempotente: un trabajo inexistente no es un error, solo devuelve `False`.
    """

    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ArtifactNotFoundError("The job identifier is not valid")

    job_directory = artifact_root / job_id
    if not job_directory.is_dir():
        return False
    rmtree(job_directory)
    return True


def _write_manifest(job_directory: Path, result: StatementJobResult, *, overwrite: bool) -> None:
    document = {
        "schema": JOB_MANIFEST_SCHEMA,
        "version": JOB_MANIFEST_VERSION,
        "result": result.as_payload(),
    }
    serialized = json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True)

    def writer(path: Path) -> None:
        path.write_text(serialized, encoding="utf-8")

    def verifier(path: Path) -> None:
        reloaded = json.loads(path.read_text(encoding="utf-8"))
        if reloaded != document:
            raise ArtifactPublicationError("The job manifest was not written faithfully")

    publish_artifact_atomically(
        job_directory / JOB_MANIFEST_NAME,
        writer=writer,
        verifier=verifier,
        overwrite=overwrite,
    )


def _checksum(path: Path) -> str:
    """Permite a quien reciba el artefacto verificarlo sin volver a procesarlo."""

    digest = sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _describe(path: Path, kind: ArtifactKind) -> ArtifactRecord:
    return ArtifactRecord(
        kind=kind,
        name=path.name,
        byte_size=path.stat().st_size,
        checksum=_checksum(path),
    )


def _publish_artifacts(
    plan: WorkbookPlan,
    job_directory: Path,
    options: StatementJobOptions,
    *,
    overwrite: bool,
) -> tuple[ArtifactRecord, ...]:
    records: list[ArtifactRecord] = []
    if options.export_xlsx:
        target = job_directory / f"{_ARTIFACT_STEM}.xlsx"
        export_workbook_plan(plan, target, overwrite=overwrite)
        records.append(_describe(target, ArtifactKind.XLSX))
    if options.export_csv:
        published = export_csv_bundle(
            plan,
            job_directory,
            stem=_ARTIFACT_STEM,
            overwrite=overwrite,
        )
        records.extend(_describe(path, ArtifactKind.CSV) for path in published)
    return tuple(records)


def run_statement_job(
    source: Path,
    *,
    strategy: StatementStrategy,
    artifact_root: Path,
    options: StatementJobOptions | None = None,
    temporary_root: Path | None = None,
) -> StatementJobResult:
    """Ejecuta la estrategia y publica sus artefactos en un directorio por trabajo.

    El mismo documento con la misma estrategia y opciones devuelve el resultado ya
    publicado en lugar de repetir el trabajo. Un directorio a medio escribir se
    completa sobrescribiendo, porque su entrada es idéntica por construcción.
    """

    resolved_options = options or StatementJobOptions()
    if not source.is_file():
        raise InvalidPdfError("The PDF source is not a regular file")
    if source.stat().st_size > resolved_options.max_bytes:
        raise PdfSizeLimitError("The document exceeds the configured size limit")

    job_id = compute_job_id(source, strategy=strategy, options=resolved_options)
    job_directory = artifact_root / job_id
    already_published = read_job_manifest(job_directory)
    if already_published is not None:
        return already_published

    incomplete = job_directory.is_dir()
    temporary_parent = Path(mkdtemp(prefix="eecc_job_", dir=temporary_root))
    try:
        outcome = strategy.process(
            source,
            default_year=resolved_options.default_year,
            temporary_parent=temporary_parent,
        )
    finally:
        rmtree(temporary_parent, ignore_errors=True)

    job_directory.mkdir(parents=True, exist_ok=True)
    artifacts: tuple[ArtifactRecord, ...] = ()
    if outcome.plan is not None:
        artifacts = _publish_artifacts(
            outcome.plan,
            job_directory,
            resolved_options,
            overwrite=incomplete,
        )

    result = StatementJobResult(
        job_id=job_id,
        extractor_id=outcome.detection.extractor_id,
        extractor_version=outcome.detection.extractor_version,
        status=outcome.status,
        row_count=outcome.row_count,
        movement_count=outcome.movement_count,
        page_count=outcome.page_count,
        warning_codes=outcome.warning_codes,
        check_codes=outcome.check_codes,
        artifacts=artifacts,
    )
    _write_manifest(job_directory, result, overwrite=incomplete)
    return result
