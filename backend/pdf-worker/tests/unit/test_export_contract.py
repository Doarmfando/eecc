"""Congela el contrato de salida y las diferencias intencionales con el legacy."""

from datetime import date
from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.models import Detection, ExtractionStatus
from statement_worker.exporters import (
    BCP_WORKBOOK_SCHEMA_ID,
    BCP_WORKBOOK_SCHEMA_VERSION,
    SpreadsheetCellType,
    build_bcp_workbook_plan,
    csv_file_name,
)
from statement_worker.extractors.bcp.document_processor import BcpPdfProcessingResult
from statement_worker.extractors.bcp.models import (
    BcpPageReadMetrics,
    BcpParsedRow,
    BcpRowType,
)
from statement_worker.extractors.bcp.validation import (
    BcpCheckStatus,
    BcpInvariantCode,
    BcpInvariantResult,
    BcpValidationReport,
)

# Hojas del exportador BCP legacy (`formatoBCP (1).py`).
_LEGACY_BCP_SHEETS = ("Resumen", "Encabezado", "Movimientos", "Control_Paginas")

# Columnas de la hoja de movimientos del exportador general legacy.
_LEGACY_MOVEMENT_COLUMNS = (
    "archivo_pdf",
    "periodo",
    "tipo_fila",
    "fecha",
    "fecha_proc",
    "fecha_valor",
    "descripcion",
    "cargo",
    "abono",
    "monto",
    "saldo",
    "moneda",
    "cuenta",
    "pagina",
    "fuente",
    "linea_original",
)

# Columnas legacy que la migración decidió no exportar por defecto.
_INTENTIONALLY_DROPPED_COLUMNS = (
    "archivo_pdf",
    "cuenta",
    "fuente",
    "linea_original",
    "moneda",
    "monto",
    "periodo",
)

_SENSITIVE_TOKENS = (
    "titular",
    "direccion",
    "dirección",
    "cuenta",
    "ruc",
    "documento",
    "archivo",
    "ruta",
    "linea_original",
)


def _result() -> BcpPdfProcessingResult:
    rows = (
        BcpParsedRow(
            row_type=BcpRowType.PREVIOUS_BALANCE,
            page=1,
            description="SALDO ANTERIOR",
            balance=Decimal("100.00"),
        ),
        BcpParsedRow(
            row_type=BcpRowType.MOVEMENT,
            page=1,
            posting_date=date(2026, 4, 1),
            value_date=date(2026, 4, 1),
            description="OPERACION SINTETICA",
            debit=Decimal("10.00"),
        ),
    )
    validation = BcpValidationReport(
        status=ExtractionStatus.SUCCEEDED,
        checks=(
            BcpInvariantResult(
                code=BcpInvariantCode.ROWS_PRESENT,
                status=BcpCheckStatus.PASSED,
            ),
        ),
        warning_codes=(),
    )
    return BcpPdfProcessingResult(
        detection=Detection(
            extractor_id="bcp-coordinate-v1",
            extractor_version="0.1.0",
            confidence=Decimal("1"),
            evidence_codes=("BANK_MARKER_BCP",),
        ),
        rows=rows,
        validation=validation,
        page_metrics=(
            BcpPageReadMetrics(
                page=1,
                word_count=30,
                row_count=5,
                table_top=Decimal("700"),
                table_bottom=Decimal("200"),
                header_detected=True,
                footer_detected=True,
            ),
        ),
    )


class BcpExportContractTests(TestCase):
    def setUp(self) -> None:
        self.plan = build_bcp_workbook_plan(_result())

    def test_schema_identity_is_pinned(self) -> None:
        self.assertEqual(self.plan.schema_id, BCP_WORKBOOK_SCHEMA_ID)
        self.assertEqual(BCP_WORKBOOK_SCHEMA_ID, "eecc.statement.bcp")
        self.assertEqual(self.plan.schema_version, BCP_WORKBOOK_SCHEMA_VERSION)
        self.assertEqual(BCP_WORKBOOK_SCHEMA_VERSION, 1)

    def test_sheets_keep_the_legacy_shape_except_the_documented_difference(self) -> None:
        sheet_names = tuple(sheet.name for sheet in self.plan.sheets)

        self.assertEqual(sheet_names, ("Resumen", "Movimientos", "Control_Paginas", "Validaciones"))
        self.assertEqual(
            set(_LEGACY_BCP_SHEETS) - set(sheet_names),
            {"Encabezado"},
            "La única hoja legacy retirada es `Encabezado`; ver docs/migration.md.",
        )
        self.assertEqual(set(sheet_names) - set(_LEGACY_BCP_SHEETS), {"Validaciones"})

    def test_movement_headers_match_the_preserved_legacy_columns(self) -> None:
        movements = next(sheet for sheet in self.plan.sheets if sheet.name == "Movimientos")

        self.assertEqual(
            tuple(column.key for column in movements.columns),
            (
                "page",
                "type",
                "posting_date",
                "value_date",
                "description",
                "debit",
                "credit",
                "balance",
            ),
        )
        preserved = set(_LEGACY_MOVEMENT_COLUMNS) - set(_INTENTIONALLY_DROPPED_COLUMNS)
        self.assertEqual(
            preserved,
            {
                "tipo_fila",
                "fecha",
                "fecha_proc",
                "fecha_valor",
                "descripcion",
                "cargo",
                "abono",
                "saldo",
                "pagina",
            },
        )

    def test_no_sheet_exports_identifying_or_environment_columns(self) -> None:
        for sheet in self.plan.sheets:
            for column in sheet.columns:
                haystack = f"{column.key} {column.header}".casefold()
                for token in _SENSITIVE_TOKENS:
                    with self.subTest(sheet=sheet.name, column=column.key, token=token):
                        self.assertNotIn(token, haystack)

    def test_every_amount_and_date_declares_an_explicit_format(self) -> None:
        for sheet in self.plan.sheets:
            for column in sheet.columns:
                with self.subTest(sheet=sheet.name, column=column.key):
                    if column.cell_type is SpreadsheetCellType.DECIMAL:
                        self.assertIsNotNone(column.number_format)
                    if column.cell_type is SpreadsheetCellType.DATE:
                        self.assertEqual(column.number_format, "yyyy-mm-dd")
                    if column.cell_type is SpreadsheetCellType.TEXT:
                        self.assertIsNone(column.number_format)

    def test_amounts_stay_decimal_inside_the_plan(self) -> None:
        for sheet in self.plan.sheets:
            decimal_indexes = [
                index
                for index, column in enumerate(sheet.columns)
                if column.cell_type is SpreadsheetCellType.DECIMAL
            ]
            for row in sheet.rows:
                for index in decimal_indexes:
                    with self.subTest(sheet=sheet.name, column=sheet.columns[index].key):
                        self.assertIsInstance(row[index], (Decimal, type(None)))

    def test_csv_bundle_names_are_derived_from_the_same_sheets(self) -> None:
        self.assertEqual(
            tuple(csv_file_name("eecc", sheet.name) for sheet in self.plan.sheets),
            (
                "eecc_Resumen.csv",
                "eecc_Movimientos.csv",
                "eecc_Control_Paginas.csv",
                "eecc_Validaciones.csv",
            ),
        )
