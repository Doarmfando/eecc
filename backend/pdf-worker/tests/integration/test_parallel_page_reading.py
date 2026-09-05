"""Repartir páginas entre procesos no puede cambiar lo que se lee."""

from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf

import statement_worker.extractors.bcp.pdfplumber_adapter as bcp_adapter
import statement_worker.extractors.generic.pdfplumber_adapter as generic_adapter
from statement_worker.domain.errors import InvalidPdfError
from statement_worker.extractors.bcp.pdfplumber_adapter import read_bcp_pdf_with_pdfplumber
from statement_worker.extractors.generic.pdfplumber_adapter import read_generic_tables
from statement_worker.extractors.page_parallelism import (
    PARALLEL_PAGE_THRESHOLD,
    ParallelReadUnavailableError,
    plan_page_ranges,
    read_pages_in_parallel,
    resolve_worker_count,
)


def _unusable_pool(*_args: object, **_kwargs: object) -> list[object]:
    raise ParallelReadUnavailableError("simulated pool failure")


def _dying_reader(_arguments: object) -> list[object]:
    """Simula un hijo que muere a mitad: el pool queda inservible para el padre."""

    import os

    os._exit(1)


def _document_error_reader(_arguments: object) -> list[object]:
    """Un error del documento debe viajar intacto desde el hijo."""

    raise InvalidPdfError("The PDF page is too small for the BCP layout")


_PAGES = 6
_WORKERS = 3


class ParallelPageReadingTests(TestCase):
    """El acelerón solo vale si el resultado es exactamente el mismo."""

    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_parallel_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.pdf_path = self.directory / "multipage-bcp.pdf"
        create_synthetic_bcp_pdf(self.pdf_path, page_count=_PAGES)

    def test_parallel_reading_matches_sequential_reading(self) -> None:
        sequential = read_bcp_pdf_with_pdfplumber(self.pdf_path, max_workers=1)
        parallel = read_bcp_pdf_with_pdfplumber(self.pdf_path, max_workers=_WORKERS)

        self.assertEqual(sequential.page_rows, parallel.page_rows)
        self.assertEqual(sequential.page_metrics, parallel.page_metrics)
        self.assertEqual(sequential.probe, parallel.probe)

    def test_each_page_keeps_its_own_content(self) -> None:
        """Un tramo devuelto fuera de sitio dejaría el día en la página ajena."""

        result = read_bcp_pdf_with_pdfplumber(self.pdf_path, max_workers=_WORKERS)

        self.assertEqual(
            [metric.page for metric in result.page_metrics],
            list(range(1, _PAGES + 1)),
        )
        for page in range(1, _PAGES + 1):
            texts = [
                word.text
                for number, row in result.page_rows
                if number == page
                for word in row.words
            ]
            self.assertIn(f"{page:02d}ABR", texts)

    def test_only_the_first_page_carries_the_document_text(self) -> None:
        """El texto completo es la operación más cara: se extrae una sola vez."""

        result = read_bcp_pdf_with_pdfplumber(self.pdf_path, max_workers=_WORKERS)

        self.assertEqual(result.probe.page_count, _PAGES)
        self.assertIn("ESTADO DE CUENTA", result.probe.first_page_text)


class GenericParallelReadingTests(TestCase):
    """El respaldo genérico lee más por página que el BCP; el reparto vale igual."""

    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_generic_parallel_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.pdf_path = self.directory / "multipage.pdf"
        create_synthetic_bcp_pdf(self.pdf_path, page_count=_PAGES)

    def test_parallel_reading_matches_sequential_reading(self) -> None:
        sequential = read_generic_tables(self.pdf_path, max_workers=1)
        parallel = read_generic_tables(self.pdf_path, max_workers=_WORKERS)

        self.assertEqual(sequential.pages, parallel.pages)
        self.assertEqual(sequential.grids, parallel.grids)
        self.assertEqual(sequential.probe, parallel.probe)
        self.assertEqual(len(parallel.pages), _PAGES)

    def test_the_page_limit_is_respected_when_reading_in_parallel(self) -> None:
        """`max_pages` acota la detección: repartir no puede leer de más."""

        limited = read_generic_tables(self.pdf_path, max_pages=3, max_workers=_WORKERS)

        self.assertEqual([page.page for page in limited.pages], [1, 2, 3])
        self.assertEqual(limited.probe.page_count, _PAGES)


class BrokenPoolTests(TestCase):
    """Distinguir un fallo de la máquina de un fallo del documento."""

    def test_a_child_that_dies_becomes_a_recoverable_error(self) -> None:
        with self.assertRaises(ParallelReadUnavailableError):
            read_pages_in_parallel(_dying_reader, Path("documento.pdf"), 4, 2)

    def test_a_document_error_travels_intact_from_the_child(self) -> None:
        """Repetirlo en este proceso daría lo mismo: no se cae al camino secuencial."""

        with self.assertRaises(InvalidPdfError):
            read_pages_in_parallel(_document_error_reader, Path("documento.pdf"), 4, 2)


class PoolFallbackTests(TestCase):
    """Si la máquina no puede repartir, el documento sigue siendo legible."""

    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_fallback_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.pdf_path = self.directory / "multipage.pdf"
        create_synthetic_bcp_pdf(self.pdf_path, page_count=_PAGES)

    def test_bcp_reading_falls_back_and_returns_the_same_result(self) -> None:
        expected = read_bcp_pdf_with_pdfplumber(self.pdf_path, max_workers=1)

        with patch.object(bcp_adapter, "read_pages_in_parallel", _unusable_pool):
            recovered = read_bcp_pdf_with_pdfplumber(self.pdf_path, max_workers=_WORKERS)

        self.assertEqual(recovered.page_rows, expected.page_rows)
        self.assertEqual(recovered.page_metrics, expected.page_metrics)
        self.assertEqual(recovered.probe, expected.probe)

    def test_generic_reading_falls_back_and_returns_the_same_result(self) -> None:
        expected = read_generic_tables(self.pdf_path, max_workers=1)

        with patch.object(generic_adapter, "read_pages_in_parallel", _unusable_pool):
            recovered = read_generic_tables(self.pdf_path, max_workers=_WORKERS)

        self.assertEqual(recovered.pages, expected.pages)
        self.assertEqual(recovered.grids, expected.grids)
        self.assertEqual(recovered.probe, expected.probe)


class WorkerCountTests(TestCase):
    def test_short_documents_stay_sequential(self) -> None:
        self.assertEqual(resolve_worker_count(1), 1)
        self.assertEqual(resolve_worker_count(PARALLEL_PAGE_THRESHOLD - 1), 1)

    def test_long_documents_use_more_than_one_process(self) -> None:
        self.assertGreaterEqual(resolve_worker_count(PARALLEL_PAGE_THRESHOLD), 1)

    def test_an_explicit_request_is_honoured_and_never_reaches_zero(self) -> None:
        self.assertEqual(resolve_worker_count(1000, 2), 2)
        self.assertEqual(resolve_worker_count(1000, 0), 1)
        self.assertEqual(resolve_worker_count(1000, -4), 1)


class PageRangeTests(TestCase):
    """Los tramos deben cubrir el documento entero, sin huecos ni repeticiones."""

    def _covered(self, page_count: int, workers: int) -> list[int]:
        ranges = plan_page_ranges(Path("documento.pdf"), page_count, workers)
        return [number for _path, first, last in ranges for number in range(first, last + 1)]

    def test_every_page_belongs_to_exactly_one_range(self) -> None:
        for page_count in (1, 5, 24, 100, 425, 447):
            for workers in (1, 3, 8):
                with self.subTest(pages=page_count, workers=workers):
                    self.assertEqual(
                        self._covered(page_count, workers), list(range(1, page_count + 1))
                    )

    def test_more_processes_than_pages_creates_no_empty_range(self) -> None:
        ranges = plan_page_ranges(Path("documento.pdf"), 3, 8)

        self.assertEqual(len(ranges), 3)
        self.assertTrue(all(first <= last for _path, first, last in ranges))
