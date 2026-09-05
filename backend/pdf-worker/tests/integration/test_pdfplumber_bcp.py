from decimal import Decimal
from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from uuid import uuid4

from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf

from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.bcp.document_processor import process_bcp_pdf
from statement_worker.extractors.bcp.models import BcpRowType
from statement_worker.extractors.bcp.pdfplumber_adapter import read_bcp_pdf_with_pdfplumber


class PdfPlumberBcpIntegrationTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_bcp_pdf_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.pdf_path = self.directory / "synthetic-bcp.pdf"
        create_synthetic_bcp_pdf(self.pdf_path)

    def test_adapter_reads_visual_rows_and_safe_metrics(self) -> None:
        result = read_bcp_pdf_with_pdfplumber(self.pdf_path)

        self.assertEqual(result.probe.page_count, 1)
        self.assertIn("BCP", result.probe.first_page_text)
        self.assertGreaterEqual(len(result.page_rows), 5)
        self.assertEqual(len(result.page_metrics), 1)
        self.assertTrue(result.page_metrics[0].header_detected)
        self.assertTrue(result.page_metrics[0].footer_detected)

    def test_document_processor_reconciles_synthetic_pdf(self) -> None:
        result = process_bcp_pdf(self.pdf_path, temporary_parent=self.directory)

        self.assertEqual(result.validation.status, ExtractionStatus.SUCCEEDED)
        self.assertGreaterEqual(result.detection.confidence, Decimal("0.75"))
        movements = [row for row in result.rows if row.row_type is BcpRowType.MOVEMENT]
        self.assertEqual(len(movements), 1)
        self.assertEqual(
            movements[0].description,
            "OPERACION SINTETICA | DETALLE SINTETICO",
        )

    def test_document_processor_sanitizes_wrapped_pdf(self) -> None:
        wrapped_path = self.directory / "wrapped.bin"
        wrapped_path.write_bytes(b"WRAPPER" + self.pdf_path.read_bytes() + b"TRAILER")

        result = process_bcp_pdf(wrapped_path, temporary_parent=self.directory)

        self.assertEqual(result.validation.status, ExtractionStatus.SUCCEEDED)
        self.assertEqual(list(self.directory.glob("eecc_pdf_*")), [])
