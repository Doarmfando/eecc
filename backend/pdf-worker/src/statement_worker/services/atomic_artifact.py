"""Publicación atómica de artefactos ya cerrados y verificados."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from os import link, replace
from os import name as os_name
from pathlib import Path
from tempfile import NamedTemporaryFile

from statement_worker.domain.errors import (
    ArtifactAlreadyExistsError,
    ArtifactPublicationError,
)

ArtifactWriter = Callable[[Path], None]
ArtifactVerifier = Callable[[Path], None]


@dataclass(frozen=True, slots=True)
class ArtifactPlan:
    """Un archivo del paquete, con su escritor y su verificador propios."""

    target: Path
    writer: ArtifactWriter
    verifier: ArtifactVerifier


def _create_temporary(target: Path) -> Path:
    with NamedTemporaryFile(
        prefix=".eecc_artifact_",
        suffix=target.suffix,
        dir=target.parent,
        delete=False,
    ) as temporary_file:
        temporary_path = Path(temporary_file.name)

    if os_name != "nt":  # pragma: no cover - Windows is the current CI platform.
        temporary_path.chmod(0o600)
    return temporary_path


def _discard(temporary_path: Path) -> None:
    """Nunca deja que la limpieza oculte el error real del escritor.

    Un escritor que falla a mitad puede dejar el archivo abierto; en Windows eso
    impide borrarlo. El temporal queda en el directorio del destino y la excepción
    original llega intacta al llamador.
    """

    try:
        temporary_path.unlink(missing_ok=True)
    except OSError:
        return


def _publish(temporary_path: Path, target: Path, *, overwrite: bool) -> None:
    if overwrite:
        replace(temporary_path, target)
        return
    try:
        link(temporary_path, target)
    except FileExistsError as error:
        raise ArtifactAlreadyExistsError("The artifact target already exists") from error


def publish_artifacts_atomically(
    plans: Iterable[ArtifactPlan],
    *,
    overwrite: bool = False,
) -> None:
    """Escribe y verifica todo el paquete antes de publicar cualquier archivo."""

    ordered_plans = tuple(plans)
    if not ordered_plans:
        raise ArtifactPublicationError("An artifact bundle requires at least one artifact")

    targets = tuple(plan.target for plan in ordered_plans)
    if len({str(target) for target in targets}) != len(targets):
        raise ArtifactPublicationError("An artifact bundle cannot repeat a target")
    for target in targets:
        if not target.parent.is_dir():
            raise ArtifactPublicationError("The artifact parent directory does not exist")
        if target.exists() and not overwrite:
            raise ArtifactAlreadyExistsError("The artifact target already exists")

    temporary_paths: list[Path] = []
    published: list[Path] = []
    try:
        for plan in ordered_plans:
            temporary_path = _create_temporary(plan.target)
            temporary_paths.append(temporary_path)
            plan.writer(temporary_path)
            if not temporary_path.is_file() or temporary_path.stat().st_size == 0:
                raise ArtifactPublicationError("The artifact writer produced an empty file")
            plan.verifier(temporary_path)

        for plan, temporary_path in zip(ordered_plans, temporary_paths, strict=True):
            _publish(temporary_path, plan.target, overwrite=overwrite)
            published.append(plan.target)
    except BaseException:
        # Con `overwrite` no existe copia previa que restaurar; sin él, nada queda publicado.
        if not overwrite:
            for target in published:
                target.unlink(missing_ok=True)
        raise
    finally:
        for temporary_path in temporary_paths:
            _discard(temporary_path)


def publish_artifact_atomically(
    target: Path,
    *,
    writer: ArtifactWriter,
    verifier: ArtifactVerifier,
    overwrite: bool = False,
) -> None:
    """Publica en el mismo volumen solo después de escribir y verificar."""

    publish_artifacts_atomically(
        (ArtifactPlan(target=target, writer=writer, verifier=verifier),),
        overwrite=overwrite,
    )
