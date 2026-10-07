"""Apertura de estados de cuenta protegidos con contraseña."""

from __future__ import annotations

from pathlib import Path

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

from statement_worker.domain.errors import (
    InvalidPdfError,
    PdfPasswordIncorrectError,
    PdfPasswordRequiredError,
)


def unlock_pdf(source: Path, destination: Path, *, password: str | None) -> Path:
    """Devuelve una ruta que cualquier lector abre sin contraseña.

    Los bancos envían el estado de cuenta por correo protegido con contraseña de
    apertura (casi siempre el DNI). pdfminer no lo abre sin ella y el fallo llegaba
    a la persona como «no pudo leerse como PDF», que no le dice qué hacer.

    Se descifra una sola vez, en `destination`, para que las estrategias y sus
    lecturas en paralelo sigan recibiendo una ruta sin saber de contraseñas. Un
    documento que abre sin contraseña se devuelve tal cual, aunque lleve permisos
    de propietario: pdfminer ya los lee y reescribirlo no aporta nada.
    """

    try:
        pdfium.PdfDocument(source).close()
    except pdfium.PdfiumError as error:
        if error.err_code != pdfium_c.FPDF_ERR_PASSWORD:
            # Lo que pdfium no entiende lo juzga el lector de cada estrategia, que
            # ya traduce sus propios fallos a un error de dominio.
            return source
    else:
        return source

    if not password:
        raise PdfPasswordRequiredError("The PDF requires an opening password")

    try:
        document = pdfium.PdfDocument(source, password=password)
    except pdfium.PdfiumError as error:
        if error.err_code == pdfium_c.FPDF_ERR_PASSWORD:
            raise PdfPasswordIncorrectError("The password does not open the PDF") from error
        raise InvalidPdfError("The protected PDF could not be read") from error
    try:
        document.save(destination, flags=pdfium_c.FPDF_REMOVE_SECURITY)
    except pdfium.PdfiumError as error:
        raise InvalidPdfError("The protected PDF could not be decrypted") from error
    finally:
        document.close()
    return destination
