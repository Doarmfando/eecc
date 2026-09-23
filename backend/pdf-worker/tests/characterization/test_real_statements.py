"""Caracterización contra los estados de cuenta reales del repositorio.

Estos documentos no se versionan y contienen información financiera real. La suite
se ejecuta solo cuando los archivos existen localmente y `RUN_REAL_STATEMENTS=1`:

    RUN_REAL_STATEMENTS=1 .\\.venv\\Scripts\\python.exe -m pytest tests/characterization

Ninguna aserción imprime descripciones, importes ni datos del titular: se comparan
conteos, sumas entre sí y estados de invariantes. Sirve para impedir que vuelva a
ocurrir lo detectado el 2026-08-26, cuando el detector rechazaba documentos válidos
y las invariantes malinterpretaban el total impreso al pie.
"""

from __future__ import annotations

import os
from decimal import Decimal
from pathlib import Path
from unittest import TestCase, skipUnless

from openpyxl import load_workbook

from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.banco_nacion.detector import BancoNacionTemplateDetector
from statement_worker.extractors.banco_nacion.strategy import BancoNacionStatementStrategy
from statement_worker.extractors.bbva.detector import BbvaTemplateDetector
from statement_worker.extractors.bbva.strategy import BbvaStatementStrategy
from statement_worker.extractors.bcp.detector import BcpTemplateDetector
from statement_worker.extractors.bcp.document_processor import process_bcp_pdf
from statement_worker.extractors.bcp.models import BcpRowType
from statement_worker.extractors.bcp.pdfplumber_adapter import probe_bcp_pdf_with_pdfplumber
from statement_worker.extractors.bcp.validation import BcpCheckStatus
from statement_worker.extractors.interbank.detector import InterbankTemplateDetector
from statement_worker.extractors.interbank.strategy import InterbankStatementStrategy
from tests.characterization.legacy_harness import references_root

ENABLED = os.environ.get("RUN_REAL_STATEMENTS") == "1"
ROOT = references_root()


def _all_pdfs() -> tuple[Path, ...]:
    """Cualquier PDF que haya en `referencias/`, descubierto y no listado.

    Los nombres de los estados de cuenta reales llevan el titular y el número de
    cuenta, así que no pueden quedar escritos en el repositorio. Descubrirlos tiene
    además la ventaja de que la suite corre con los documentos que tengas tú.
    """

    if ROOT is None or not ENABLED:
        return ()
    return tuple(sorted(ROOT.glob("*.pdf")))


def _available() -> tuple[Path, ...]:
    """Los PDF de BCP: cada banco se caracteriza con su propio extractor."""

    return tuple(
        path
        for path in _all_pdfs()
        if BcpTemplateDetector().accepts(probe_bcp_pdf_with_pdfplumber(path))
    )


def _bbva_available() -> tuple[Path, ...]:
    return tuple(
        path
        for path in _all_pdfs()
        if BbvaTemplateDetector().accepts(probe_bcp_pdf_with_pdfplumber(path))
    )


def _interbank_available() -> tuple[Path, ...]:
    return tuple(
        path
        for path in _all_pdfs()
        if InterbankTemplateDetector().accepts(probe_bcp_pdf_with_pdfplumber(path))
    )


def _banco_nacion_available() -> tuple[Path, ...]:
    return tuple(
        path
        for path in _all_pdfs()
        if BancoNacionTemplateDetector().accepts(probe_bcp_pdf_with_pdfplumber(path))
    )


@skipUnless(
    ENABLED and _banco_nacion_available(),
    "Requiere RUN_REAL_STATEMENTS=1 y PDF del Banco de la Nación",
)
class RealBancoNacionStatementTests(TestCase):
    """La plantilla se construyó sin un documento real: esta es la primera prueba de verdad.

    Si falla, los códigos de advertencia y de comprobación dicen qué parte de la
    plantilla supuesta no coincide, sin imprimir nada del documento.
    """

    def test_every_banco_nacion_statement_reconciles_to_the_cent(self) -> None:
        for numero, path in enumerate(_banco_nacion_available(), start=1):
            with self.subTest(statement=f"documento {numero}"):
                outcome = BancoNacionStatementStrategy().process(path)

                self.assertGreater(outcome.movement_count, 0)
                self.assertEqual(outcome.warning_codes, ())
                self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED, outcome.check_codes)


@skipUnless(ENABLED and _bbva_available(), "Requiere RUN_REAL_STATEMENTS=1 y PDF del BBVA")
class RealBbvaStatementTests(TestCase):
    """El ITF va en columna propia y descuenta del saldo: si eso se lee mal, la
    continuidad falla y estas aserciones lo dicen sin imprimir ningún importe."""

    def test_every_bbva_statement_reconciles_to_the_cent(self) -> None:
        for numero, path in enumerate(_bbva_available(), start=1):
            with self.subTest(statement=f"documento {numero}"):
                outcome = BbvaStatementStrategy().process(path)

                self.assertGreater(outcome.movement_count, 0)
                self.assertEqual(outcome.warning_codes, ())
                self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED, outcome.check_codes)


@skipUnless(ENABLED and _interbank_available(), "Requiere RUN_REAL_STATEMENTS=1 y PDF de Interbank")
class RealInterbankStatementTests(TestCase):
    def test_every_interbank_statement_reconciles_to_the_cent(self) -> None:
        for numero, path in enumerate(_interbank_available(), start=1):
            with self.subTest(statement=f"documento {numero}"):
                outcome = InterbankStatementStrategy().process(path)

                self.assertGreater(outcome.movement_count, 0)
                self.assertEqual(outcome.warning_codes, ())
                self.assertEqual({status for _code, status in outcome.check_codes}, {"PASSED"})
                self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED)


@skipUnless(ENABLED and _available(), "Requiere RUN_REAL_STATEMENTS=1 y los PDF locales")
class RealStatementTests(TestCase):
    def test_every_real_statement_is_detected_and_reconciles(self) -> None:
        for numero, path in enumerate(_available(), start=1):
            with self.subTest(statement=f"documento {numero}"):
                result = process_bcp_pdf(path)

                self.assertGreaterEqual(result.detection.confidence, Decimal("0.75"))
                self.assertGreater(len(result.page_metrics), 100)
                self.assertGreater(len(result.rows), 1000)

                failed = [
                    check.code.value
                    for check in result.validation.checks
                    if check.status is BcpCheckStatus.FAILED
                ]
                self.assertEqual(failed, [])
                self.assertEqual(result.validation.status, ExtractionStatus.SUCCEEDED)
                self.assertEqual(result.validation.warning_codes, ())

    def test_the_closing_total_matches_the_whole_document(self) -> None:
        for numero, path in enumerate(_available(), start=1):
            with self.subTest(statement=f"documento {numero}"):
                result = process_bcp_pdf(path)

                printed = [
                    row
                    for row in result.rows
                    if row.row_type is BcpRowType.MOVEMENT_TOTAL
                    and (row.debit is not None or row.credit is not None)
                ]
                self.assertEqual(len(printed), 1, "la plantilla imprime un único total")

                debits = sum(
                    (row.debit or Decimal("0"))
                    for row in result.rows
                    if row.row_type is BcpRowType.MOVEMENT
                )
                credits = sum(
                    (row.credit or Decimal("0"))
                    for row in result.rows
                    if row.row_type is BcpRowType.MOVEMENT
                )
                self.assertEqual(printed[0].debit, debits)
                self.assertEqual(printed[0].credit, credits)

    def test_matches_the_legacy_extraction_row_by_row(self) -> None:
        if ROOT is None:
            self.skipTest("Sin raíz del repositorio")

        pdf = _available()[0]
        legacy = pdf.with_suffix(".xlsx")
        if not pdf.is_file() or not legacy.is_file():
            self.skipTest("Falta el PDF o el XLSX que produjo el script legacy")

        workbook = load_workbook(legacy, read_only=True, data_only=True)
        try:
            sheet = workbook["Movimientos"]
            records = sheet.iter_rows(values_only=True)
            columns = {str(name): index for index, name in enumerate(next(records))}
            legacy_movements = 0
            legacy_debit = Decimal("0")
            legacy_credit = Decimal("0")
            for record in records:
                if str(record[columns["tipo_fila"]]) != "MOVIMIENTO":
                    continue
                legacy_movements += 1
                legacy_debit += Decimal(str(record[columns["cargo"]] or 0))
                legacy_credit += Decimal(str(record[columns["abono"]] or 0))
        finally:
            workbook.close()

        result = process_bcp_pdf(pdf)
        movements = [row for row in result.rows if row.row_type is BcpRowType.MOVEMENT]
        debit = sum((row.debit or Decimal("0")) for row in movements)
        credit = sum((row.credit or Decimal("0")) for row in movements)

        self.assertEqual(len(movements), legacy_movements)
        self.assertEqual(debit, legacy_debit)
        self.assertEqual(credit, legacy_credit)
