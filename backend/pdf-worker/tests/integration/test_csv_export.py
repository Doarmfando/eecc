from datetime import date
from decimal import Decimal
from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from uuid import uuid4

from tests.support.synthetic_bcp_pdf import create_synthetic_bcp_pdf

from statement_worker.domain.errors import (
    ArtifactAlreadyExistsError,
    ArtifactPublicationError,
    InvalidWorkbookDataError,
)
from statement_worker.exporters import (
    CSV_DELIMITER,
    CSV_ENCODING,
    SpreadsheetCellType,
    SpreadsheetColumn,
    SpreadsheetSheet,
    WorkbookPlan,
    build_bcp_workbook_plan,
    csv_file_name,
    export_csv_bundle,
    render_csv_value,
    sanitize_spreadsheet_text,
    verify_sheet_csv,
    write_sheet_csv,
)
from statement_worker.exporters import csv_export as csv_export_module
from statement_worker.extractors.bcp.document_processor import process_bcp_pdf

_UNSAFE_DESCRIPTION = '=HYPERLINK("http://ficticio")'


def _sheet(name: str = "Movimientos", table_name: str = "MovimientosPrueba") -> SpreadsheetSheet:
    return SpreadsheetSheet(
        name=name,
        table_name=table_name,
        columns=(
            SpreadsheetColumn(
                key="page",
                header="Página",
                cell_type=SpreadsheetCellType.INTEGER,
                width=10,
            ),
            SpreadsheetColumn(
                key="posting_date",
                header="Fecha proceso",
                cell_type=SpreadsheetCellType.DATE,
                width=15,
            ),
            SpreadsheetColumn(
                key="description",
                header="Descripción",
                cell_type=SpreadsheetCellType.TEXT,
                width=48,
            ),
            SpreadsheetColumn(
                key="debit",
                header="Cargo",
                cell_type=SpreadsheetCellType.DECIMAL,
                width=16,
            ),
            SpreadsheetColumn(
                key="reviewed",
                header="Revisado",
                cell_type=SpreadsheetCellType.BOOLEAN,
                width=12,
            ),
        ),
        rows=(
            (
                1,
                date(2026, 4, 1),
                sanitize_spreadsheet_text(_UNSAFE_DESCRIPTION),
                Decimal("1234.50"),
                True,
            ),
            (2, None, 'TEXTO, CON COMA Y "COMILLAS"', None, False),
        ),
    )


def _plan() -> WorkbookPlan:
    return WorkbookPlan(
        schema_id="eecc.statement.test",
        schema_version=1,
        sheets=(
            _sheet(),
            SpreadsheetSheet(
                name="Control_Paginas",
                table_name="ControlPaginasPrueba",
                columns=(
                    SpreadsheetColumn(
                        key="code",
                        header="Código",
                        cell_type=SpreadsheetCellType.TEXT,
                        width=44,
                    ),
                ),
                rows=(),
            ),
        ),
    )


class CsvValueRenderingTests(TestCase):
    def test_renders_each_declared_type_without_locale_dependencies(self) -> None:
        cases = (
            (None, SpreadsheetCellType.TEXT, ""),
            (None, SpreadsheetCellType.DECIMAL, ""),
            ("SALDO ANTERIOR", SpreadsheetCellType.TEXT, "SALDO ANTERIOR"),
            (7, SpreadsheetCellType.INTEGER, "7"),
            (date(2026, 4, 1), SpreadsheetCellType.DATE, "2026-04-01"),
            (Decimal("1234.50"), SpreadsheetCellType.DECIMAL, "1234.50"),
            (Decimal("1E+2"), SpreadsheetCellType.DECIMAL, "100"),
            (True, SpreadsheetCellType.BOOLEAN, "true"),
            (False, SpreadsheetCellType.BOOLEAN, "false"),
        )
        for value, cell_type, expected in cases:
            with self.subTest(cell_type=cell_type, value=value):
                self.assertEqual(render_csv_value(value, cell_type), expected)

    def test_rejects_unsafe_file_names(self) -> None:
        self.assertEqual(
            csv_file_name("eecc-2026", "Control_Paginas"),
            "eecc-2026_Control_Paginas.csv",
        )
        self.assertEqual(csv_file_name("eecc", "Páginas 1"), "eecc_P_ginas_1.csv")
        for stem in ("", ".hidden", "../escape", "con espacio", "a" * 65):
            with self.subTest(stem=stem), self.assertRaises(InvalidWorkbookDataError):
                csv_file_name(stem, "Movimientos")
        with self.assertRaises(InvalidWorkbookDataError):
            csv_file_name("eecc", "///")


class CsvExportIntegrationTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_csv_export_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)

    def test_written_file_uses_the_declared_encoding_and_quoting(self) -> None:
        sheet = _sheet()
        target = self.directory / "sheet.csv"

        write_sheet_csv(sheet, target)

        raw = target.read_bytes()
        self.assertTrue(raw.startswith(b"\xef\xbb\xbf"))
        self.assertNotIn(b"\n\n", raw)
        text = raw.decode(CSV_ENCODING)
        lines = text.split("\r\n")
        self.assertEqual(lines[-1], "")
        self.assertEqual(
            lines[0],
            CSV_DELIMITER.join(("Página", "Fecha proceso", "Descripción", "Cargo", "Revisado")),
        )
        self.assertEqual(lines[1], '1,2026-04-01,"\'=HYPERLINK(""http://ficticio"")",1234.50,true')
        self.assertEqual(lines[2], '2,,"TEXTO, CON COMA Y ""COMILLAS""",,false')
        verify_sheet_csv(sheet, target)

    def test_verification_detects_edited_or_truncated_files(self) -> None:
        sheet = _sheet()
        target = self.directory / "sheet.csv"
        write_sheet_csv(sheet, target)
        original = target.read_text(encoding=CSV_ENCODING)

        target.write_text(original.replace("1234.50", "1234.51"), encoding=CSV_ENCODING)
        with self.assertRaises(ArtifactPublicationError):
            verify_sheet_csv(sheet, target)

        target.write_text(original.split("\r\n")[0] + "\r\n", encoding=CSV_ENCODING)
        with self.assertRaises(ArtifactPublicationError):
            verify_sheet_csv(sheet, target)

        target.write_bytes(b"\xff\xfe\x00 binario")
        with self.assertRaises(ArtifactPublicationError):
            verify_sheet_csv(sheet, target)

    def test_bundle_publishes_one_file_per_sheet(self) -> None:
        plan = _plan()

        published = export_csv_bundle(plan, self.directory, stem="eecc-abril")

        self.assertEqual(
            [path.name for path in published],
            ["eecc-abril_Movimientos.csv", "eecc-abril_Control_Paginas.csv"],
        )
        self.assertTrue(all(path.is_file() for path in published))
        self.assertEqual(list(self.directory.glob(".eecc_artifact_*")), [])
        for sheet, path in zip(plan.sheets, published, strict=True):
            verify_sheet_csv(sheet, path)

    def test_bundle_preserves_targets_unless_overwrite_is_explicit(self) -> None:
        plan = _plan()
        export_csv_bundle(plan, self.directory, stem="eecc")
        snapshot = {path.name: path.read_bytes() for path in self.directory.glob("*.csv")}

        with self.assertRaises(ArtifactAlreadyExistsError):
            export_csv_bundle(plan, self.directory, stem="eecc")
        self.assertEqual(
            {path.name: path.read_bytes() for path in self.directory.glob("*.csv")},
            snapshot,
        )

        export_csv_bundle(plan, self.directory, stem="eecc", overwrite=True)
        self.assertEqual(len(list(self.directory.glob("*.csv"))), len(plan.sheets))

    def test_bundle_publishes_nothing_when_a_later_sheet_fails(self) -> None:
        broken_sheet = SpreadsheetSheet(
            name="Validaciones",
            table_name="ValidacionesPrueba",
            columns=_sheet().columns,
            rows=((1, date(2026, 4, 1), "OK", Decimal("1.00"), True),),
        )
        plan = WorkbookPlan(
            schema_id="eecc.statement.test",
            schema_version=1,
            sheets=(_sheet(), broken_sheet),
        )
        original_writer = write_sheet_csv

        def failing_writer(sheet: SpreadsheetSheet, path: Path) -> None:
            if sheet.name == "Validaciones":
                path.write_text("contenido corrupto\r\n", encoding=CSV_ENCODING)
                return
            original_writer(sheet, path)

        csv_export_module.write_sheet_csv = failing_writer  # type: ignore[assignment]
        self.addCleanup(setattr, csv_export_module, "write_sheet_csv", original_writer)

        with self.assertRaises(ArtifactPublicationError):
            export_csv_bundle(plan, self.directory, stem="eecc")

        self.assertEqual(list(self.directory.glob("*.csv")), [])
        self.assertEqual(list(self.directory.glob(".eecc_artifact_*")), [])

    def test_bundle_requires_an_existing_directory(self) -> None:
        with self.assertRaises(ArtifactPublicationError):
            export_csv_bundle(_plan(), self.directory / "missing", stem="eecc")

    def test_bcp_statement_reaches_csv_and_matches_the_workbook_plan(self) -> None:
        pdf_path = self.directory / "synthetic-bcp.pdf"
        create_synthetic_bcp_pdf(pdf_path)
        result = process_bcp_pdf(pdf_path, temporary_parent=self.directory)
        plan = build_bcp_workbook_plan(result)

        published = export_csv_bundle(plan, self.directory, stem="bcp-sintetico")

        self.assertEqual(
            [path.name for path in published],
            [
                "bcp-sintetico_Resumen.csv",
                "bcp-sintetico_Movimientos.csv",
                "bcp-sintetico_Control_Paginas.csv",
                "bcp-sintetico_Validaciones.csv",
            ],
        )
        movements = published[1].read_text(encoding=CSV_ENCODING).splitlines()
        self.assertEqual(len(movements), len(result.rows) + 1)
        self.assertTrue(movements[0].startswith("Página,Tipo de fila,"))
        for sheet, path in zip(plan.sheets, published, strict=True):
            verify_sheet_csv(sheet, path)
