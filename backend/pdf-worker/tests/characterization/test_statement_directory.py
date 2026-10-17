"""Regresión optativa de una carpeta autorizada, sin registrar datos bancarios.

Requiere RUN_REAL_STATEMENTS=1 y REAL_STATEMENTS_DIRECTORY. Los documentos se
leen en su ubicación original; solo se exporta a un temporal que se elimina.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from unittest import TestCase, skipUnless

from statement_worker.domain.models import ExtractionStatus
from statement_worker.exporters.csv_export import export_csv_bundle
from statement_worker.exporters.xlsx_writer import export_workbook_plan
from statement_worker.extractors.registry import resolve_best_strategy


@skipUnless(
    os.environ.get("RUN_REAL_STATEMENTS") == "1" and os.environ.get("REAL_STATEMENTS_DIRECTORY"),
    "Requiere autorización explícita y una carpeta local de estados de cuenta",
)
class StatementDirectoryTests(TestCase):
    def test_all_statements_reconcile_and_export_verified_workbooks(self) -> None:
        directory = Path(os.environ["REAL_STATEMENTS_DIRECTORY"])
        self.assertTrue(directory.is_dir(), "La carpeta configurada no existe")
        documents = sorted(
            path for path in directory.iterdir() if path.is_file() and path.suffix.lower() == ".pdf"
        )
        self.assertTrue(documents, "La carpeta configurada no contiene PDF")

        for number, source in enumerate(documents, start=1):
            with self.subTest(document=number), tempfile.TemporaryDirectory() as temporary:
                # Los fallos del lector o escritor no deben volcar su excepción,
                # cuya cadena de causas podría incluir contenido del documento.
                try:
                    strategy = resolve_best_strategy(source)
                    outcome = strategy.process(source)
                    if outcome.plan is not None:
                        # La publicación reabre y compara cada celda con el plan;
                        # los importes se normalizan al tipo numérico de Excel.
                        export_workbook_plan(outcome.plan, Path(temporary) / "result.xlsx")
                        export_csv_bundle(outcome.plan, Path(temporary), stem="result")
                except Exception:
                    raise AssertionError(
                        "El documento no pudo procesarse o exportarse; diagnóstico omitido"
                    ) from None

                self.assertEqual(outcome.status, ExtractionStatus.SUCCEEDED)
                self.assertEqual(outcome.warning_codes, ())
                self.assertGreater(outcome.movement_count, 0)
                self.assertIsNotNone(outcome.plan)
                self.assertTrue(outcome.check_codes)
                self.assertTrue(all(status != "FAILED" for _, status in outcome.check_codes))
