from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from uuid import uuid4

import pdfplumber
from pdfplumber.utils.exceptions import PdfminerException
from reportlab.lib.pdfencrypt import StandardEncryption
from reportlab.pdfgen.canvas import Canvas

from statement_worker.domain.errors import (
    InvalidPdfError,
    PdfPasswordIncorrectError,
    PdfPasswordRequiredError,
)
from statement_worker.services.pdf_unlock import unlock_pdf

_TEXT = "DOCUMENTO SINTETICO PROTEGIDO"


def _write_pdf(path: Path, *, password: str | None = None, owner_only: bool = False) -> None:
    encryption = None
    if password is not None or owner_only:
        encryption = StandardEncryption(
            "" if owner_only else (password or ""),
            ownerPassword="propietario-sintetico",
            canCopy=0,
            strength=128,
        )
    canvas = Canvas(str(path), encrypt=encryption)
    canvas.drawString(72, 720, _TEXT)
    canvas.save()


class UnlockPdfTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_unlock_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)
        self.source = self.directory / "upload.pdf"
        self.destination = self.directory / "unlocked.pdf"

    def test_a_protected_pdf_is_the_failure_seen_in_production(self) -> None:
        # Sin desbloquear, el lector de las estrategias falla y el worker lo
        # informaba como un PDF ilegible.
        _write_pdf(self.source, password="12345678")

        with self.assertRaises(PdfminerException), pdfplumber.open(str(self.source)):
            pass

    def test_the_right_password_yields_a_copy_any_reader_opens(self) -> None:
        _write_pdf(self.source, password="12345678")

        readable = unlock_pdf(self.source, self.destination, password="12345678")

        self.assertEqual(readable, self.destination)
        self.assertNotIn(b"/Encrypt", readable.read_bytes())
        with pdfplumber.open(str(readable)) as pdf:
            self.assertIn(_TEXT, pdf.pages[0].extract_text() or "")

    def test_a_protected_pdf_without_password_asks_for_it(self) -> None:
        _write_pdf(self.source, password="12345678")

        for missing in (None, ""):
            with self.subTest(password=missing), self.assertRaises(PdfPasswordRequiredError):
                unlock_pdf(self.source, self.destination, password=missing)
        self.assertFalse(self.destination.exists())

    def test_a_wrong_password_is_told_apart_from_a_missing_one(self) -> None:
        _write_pdf(self.source, password="12345678")

        with self.assertRaises(PdfPasswordIncorrectError):
            unlock_pdf(self.source, self.destination, password="87654321")
        self.assertFalse(self.destination.exists())

    def test_a_pdf_without_opening_password_is_returned_untouched(self) -> None:
        _write_pdf(self.source)

        # Una contraseña de más no estorba: el documento no la necesita.
        for password in (None, "12345678"):
            with self.subTest(password=password):
                self.assertEqual(
                    unlock_pdf(self.source, self.destination, password=password), self.source
                )
        self.assertFalse(self.destination.exists())

    def test_owner_permissions_alone_do_not_need_unlocking(self) -> None:
        _write_pdf(self.source, owner_only=True)

        self.assertEqual(unlock_pdf(self.source, self.destination, password=None), self.source)
        with pdfplumber.open(str(self.source)) as pdf:
            self.assertIn(_TEXT, pdf.pages[0].extract_text() or "")

    def test_content_that_is_not_a_pdf_is_left_to_the_strategy_readers(self) -> None:
        self.source.write_bytes(b"%PDF-1.7 contenido que no es un estado de cuenta\n%%EOF")

        self.assertEqual(unlock_pdf(self.source, self.destination, password=None), self.source)

    def test_errors_never_carry_the_password(self) -> None:
        _write_pdf(self.source, password="12345678")

        with self.assertRaises(PdfPasswordIncorrectError) as raised:
            unlock_pdf(self.source, self.destination, password="clave-secreta-123")
        self.assertNotIn("clave-secreta-123", str(raised.exception))
        self.assertNotIsInstance(raised.exception, InvalidPdfError)
        self.assertEqual(raised.exception.code, "PDF_PASSWORD_INCORRECT")
