from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from uuid import uuid4

from statement_worker.domain.errors import DomainError, PdfPageLimitError
from statement_worker.services.page_limit import count_pdf_pages, enforce_page_limit
from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf


class PageLimitTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_page_limit_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.pdf = self.directory / "tres.pdf"
        create_synthetic_bcp_pdf(self.pdf, page_count=3)

    def test_counts_the_pages_of_a_pdf(self) -> None:
        self.assertEqual(count_pdf_pages(self.pdf), 3)

    def test_a_document_at_or_below_the_limit_passes(self) -> None:
        enforce_page_limit(self.pdf, 3)
        enforce_page_limit(self.pdf, 15)
        enforce_page_limit(self.pdf, None)

    def test_a_document_over_the_limit_is_rejected_with_its_numbers(self) -> None:
        with self.assertRaises(PdfPageLimitError) as raised:
            enforce_page_limit(self.pdf, 2)

        self.assertEqual(raised.exception.code, "PDF_PAGE_LIMIT_EXCEEDED")
        self.assertEqual(raised.exception.public_details(), {"page_count": 3, "max_pages": 2})

    def test_an_unreadable_file_is_left_to_the_statement_reader(self) -> None:
        # El lector de cada estrategia ya traduce sus fallos; la API vuelve a contar
        # las páginas del resultado, así que no se salta el límite.
        broken = self.directory / "roto.pdf"
        broken.write_bytes(b"%PDF-1.7 no es un pdf de verdad\n%%EOF")

        self.assertIsNone(count_pdf_pages(broken))
        enforce_page_limit(broken, 1)

    def test_other_domain_errors_publish_no_details(self) -> None:
        self.assertEqual(DomainError("x").public_details(), {})
