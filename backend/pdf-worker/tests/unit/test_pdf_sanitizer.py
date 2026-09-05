from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from uuid import uuid4

from statement_worker.domain.errors import InvalidPdfError, PdfSizeLimitError
from statement_worker.services.pdf_sanitizer import sanitize_pdf_bytes, sanitized_pdf_path


class PdfSanitizerTests(TestCase):
    def test_removes_external_prefix_and_suffix(self) -> None:
        wrapped = b"WRAPPER%PDF-1.7\nsynthetic\n%%EOFTRAILER"

        result = sanitize_pdf_bytes(wrapped)

        self.assertEqual(result.content, b"%PDF-1.7\nsynthetic\n%%EOF")
        self.assertEqual(result.prefix_bytes_removed, 7)
        self.assertEqual(result.suffix_bytes_removed, 7)
        self.assertTrue(result.changed)

    def test_rejects_missing_header_and_size_limit(self) -> None:
        with self.assertRaises(InvalidPdfError):
            sanitize_pdf_bytes(b"not a pdf")
        with self.assertRaises(PdfSizeLimitError):
            sanitize_pdf_bytes(b"%PDF-1.7\n%%EOF", max_bytes=5)

    def test_can_require_eof_marker(self) -> None:
        with self.assertRaises(InvalidPdfError):
            sanitize_pdf_bytes(b"%PDF-1.7\nsynthetic", require_eof=True)

    def test_allows_missing_eof_when_not_required(self) -> None:
        content = b"%PDF-1.7\nsynthetic"

        result = sanitize_pdf_bytes(content)

        self.assertEqual(result.content, content)
        self.assertFalse(result.eof_found)
        self.assertFalse(result.changed)

    def test_rejects_invalid_limit(self) -> None:
        with self.assertRaises(ValueError):
            sanitize_pdf_bytes(b"%PDF-1.7\n%%EOF", max_bytes=0)

    def test_rejects_empty_document(self) -> None:
        with self.assertRaises(InvalidPdfError):
            sanitize_pdf_bytes(b"")

    def test_context_manager_preserves_source_and_removes_temporary_copy(self) -> None:
        original_content = b"PREFIX%PDF-1.7\nsynthetic\n%%EOFSUFFIX"
        directory = Path.cwd() / f".test_pdf_sanitizer_{uuid4().hex}"
        directory.mkdir()
        self.addCleanup(rmtree, directory, True)
        source = directory / "source.bin"
        source.write_bytes(original_content)

        with sanitized_pdf_path(source, temporary_parent=directory) as readable:
            temporary = readable
            self.assertNotEqual(readable, source)
            self.assertEqual(readable.read_bytes(), b"%PDF-1.7\nsynthetic\n%%EOF")

        self.assertFalse(temporary.exists())
        self.assertEqual(source.read_bytes(), original_content)

    def test_context_manager_reuses_clean_source(self) -> None:
        directory = Path.cwd() / f".test_pdf_sanitizer_{uuid4().hex}"
        directory.mkdir()
        self.addCleanup(rmtree, directory, True)
        source = directory / "clean.pdf"
        source.write_bytes(b"%PDF-1.7\nsynthetic\n%%EOF")

        with sanitized_pdf_path(source, temporary_parent=directory) as readable:
            self.assertEqual(readable, source)

    def test_context_manager_rejects_missing_source_and_invalid_parent(self) -> None:
        directory = Path.cwd() / f".test_pdf_sanitizer_{uuid4().hex}"
        directory.mkdir()
        self.addCleanup(rmtree, directory, True)

        with self.assertRaises(InvalidPdfError), sanitized_pdf_path(directory / "missing.pdf"):
            pass

        source = directory / "wrapped.bin"
        source.write_bytes(b"PREFIX%PDF-1.7\nsynthetic\n%%EOF")
        with (
            self.assertRaises(InvalidPdfError),
            sanitized_pdf_path(
                source,
                temporary_parent=directory / "missing",
            ),
        ):
            pass

    def test_context_manager_checks_size_before_reading(self) -> None:
        directory = Path.cwd() / f".test_pdf_sanitizer_{uuid4().hex}"
        directory.mkdir()
        self.addCleanup(rmtree, directory, True)
        source = directory / "large.pdf"
        source.write_bytes(b"%PDF-1.7\n%%EOF")

        with (
            self.assertRaises(PdfSizeLimitError),
            sanitized_pdf_path(
                source,
                max_bytes=5,
                temporary_parent=directory,
            ),
        ):
            pass
