"""Repartir páginas entre procesos. No sabe de bancos ni de formatos.

Las páginas de un estado de cuenta son independientes entre sí, y convertir sus
caracteres en palabras es lo que ocupa casi todo el tiempo de un documento real.
Cada extractor decide qué lee de una página; aquí solo vive cuánto se reparte y cómo.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from math import ceil
from os import cpu_count
from pathlib import Path
from typing import TypeVar

# Arrancar ocho procesos e importar el adaptador en cada uno cuesta unos 0,4 s.
# Por debajo de estas páginas ese arranque supera al ahorro y no se reparte.
PARALLEL_PAGE_THRESHOLD = 24
MAX_PARALLEL_WORKERS = 8

# Un tramo contiguo de páginas de un documento: (ruta, primera, última), ambas incluidas.
PageRange = tuple[str, int, int]

_Readout = TypeVar("_Readout")


class ParallelReadUnavailableError(Exception):
    """El reparto no pudo llevarse a cabo por causas de la máquina, no del documento.

    No es un error de dominio: nunca llega al llamador de la API. Quien reparte debe
    volver a la lectura secuencial, que produce exactamente el mismo resultado.
    """


def resolve_worker_count(page_count: int, requested: int | None = None) -> int:
    """Un documento corto no compensa el coste de arrancar procesos."""

    if requested is not None:
        return max(1, requested)
    if page_count < PARALLEL_PAGE_THRESHOLD:
        return 1
    available = cpu_count() or 1
    # Un núcleo queda para el proceso que atiende la petición.
    return max(1, min(MAX_PARALLEL_WORKERS, available - 1))


def plan_page_ranges(pdf_path: Path, page_count: int, workers: int) -> list[PageRange]:
    """Divide el documento en tramos contiguos, uno por proceso."""

    chunk = ceil(page_count / workers)
    return [
        (str(pdf_path), start, min(start + chunk - 1, page_count))
        for start in range(1, page_count + 1, chunk)
    ]


def read_pages_in_parallel(
    range_reader: Callable[[PageRange], Sequence[_Readout]],
    pdf_path: Path,
    page_count: int,
    workers: int,
) -> list[_Readout]:
    """Lee todos los tramos a la vez y devuelve sus resultados concatenados.

    `range_reader` debe ser una función de módulo: cada proceso la recibe por
    referencia y reabre el PDF por su cuenta. El orden entre tramos no está
    garantizado, así que quien llama ordena por número de página.

    Si la máquina no puede con el reparto —un hijo muere, no quedan procesos,
    el entorno no admite `spawn`— se lanza `ParallelReadUnavailableError` para que
    quien llama lea el documento en este mismo proceso. Un error del documento sí
    viaja intacto desde el hijo: es del documento, y repetirlo daría lo mismo.
    """

    collected: list[_Readout] = []
    try:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            for group in pool.map(range_reader, plan_page_ranges(pdf_path, page_count, workers)):
                collected.extend(group)
    except (BrokenProcessPool, OSError) as error:
        raise ParallelReadUnavailableError("The page reading pool could not be used") from error
    return collected
