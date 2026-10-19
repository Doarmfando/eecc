from dataclasses import replace
from datetime import date
from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.errors import InvalidWorkbookDataError, UnexportableStatementError
from statement_worker.domain.models import AccountType, Detection, ExtractionStatus
from statement_worker.exporters import (
    SpreadsheetCellType,
    SpreadsheetColumn,
    SpreadsheetSheet,
    WorkbookPlan,
    build_bcp_workbook_plan,
    sanitize_spreadsheet_text,
    validate_workbook_plan,
)
from statement_worker.extractors.bcp.document_processor import BcpPdfProcessingResult
from statement_worker.extractors.bcp.models import (
    BcpPageReadMetrics,
    BcpParsedRow,
    BcpRowType,
    BcpStatementHeader,
    BcpWarningCode,
)
from statement_worker.extractors.bcp.validation import (
    BcpCheckStatus,
    BcpInvariantCode,
    BcpInvariantResult,
    BcpValidationReport,
)


def _sheet(plan: WorkbookPlan, name: str) -> SpreadsheetSheet:
    return next(sheet for sheet in plan.sheets if sheet.name == name)


def _result(
    *,
    status: ExtractionStatus = ExtractionStatus.SUCCEEDED,
    header: BcpStatementHeader | None = None,
) -> BcpPdfProcessingResult:
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
            description='=HYPERLINK("unsafe")',
            debit=Decimal("10.00"),
        ),
        BcpParsedRow(
            row_type=BcpRowType.MOVEMENT_TOTAL,
            page=1,
            description="TOTAL MOVIMIENTOS",
            debit=Decimal("10.00"),
            credit=Decimal("0.00"),
        ),
        BcpParsedRow(
            row_type=BcpRowType.BALANCE,
            page=1,
            description="SALDO",
            balance=Decimal("90.00"),
        ),
    )
    checks = tuple(
        BcpInvariantResult(code=code, status=BcpCheckStatus.PASSED) for code in BcpInvariantCode
    )
    warnings = (
        (BcpWarningCode.DECLARED_TOTAL_MISMATCH,) if status is ExtractionStatus.NEEDS_REVIEW else ()
    )
    return BcpPdfProcessingResult(
        detection=Detection(
            extractor_id="bcp.statement",
            extractor_version="1.0.0",
            confidence=Decimal("0.95"),
            evidence_codes=("BANK_MARKER_BCP",),
        ),
        rows=rows,
        validation=BcpValidationReport(
            status=status,
            checks=checks,
            warning_codes=warnings,
            metrics=(("rows", len(rows)),),
        ),
        page_metrics=(
            BcpPageReadMetrics(
                page=1,
                word_count=24,
                row_count=4,
                table_top=Decimal("205"),
                table_bottom=Decimal("690"),
                header_detected=True,
                footer_detected=True,
            ),
        ),
        header=header or BcpStatementHeader(),
    )


class SpreadsheetTextSafetyTests(TestCase):
    def test_neutralizes_formula_prefixes_including_leading_whitespace(self) -> None:
        for value in ("=1+1", "+CMD", "-2+3", "@SUM(A1:A2)", "  =1+1"):
            with self.subTest(value=value):
                self.assertEqual(sanitize_spreadsheet_text(value), f"'{value}")

    def test_preserves_normal_text_and_replaces_invalid_xml_controls(self) -> None:
        self.assertEqual(sanitize_spreadsheet_text("OPERACION SINTETICA"), "OPERACION SINTETICA")
        self.assertEqual(sanitize_spreadsheet_text("A\x00B"), "A\N{REPLACEMENT CHARACTER}B")


class BcpWorkbookPlanTests(TestCase):
    def test_builds_versioned_plan_with_typed_financial_values(self) -> None:
        plan = build_bcp_workbook_plan(_result())

        self.assertEqual(plan.schema_id, "eecc.statement.bcp")
        self.assertEqual(plan.schema_version, 3)
        # Las mismas hojas que BBVA y que el legacy; sin `Validaciones` (ADR-0015).
        self.assertEqual(
            tuple(sheet.name for sheet in plan.sheets),
            ("Resumen", "Encabezado", "Movimientos", "Control_Paginas"),
        )
        summary = dict(
            zip(
                (column.header for column in plan.sheets[0].columns),
                plan.sheets[0].rows[0],
                strict=True,
            )
        )
        for technical in ("Estado", "Extractor", "Versión", "Confianza"):
            self.assertNotIn(technical, summary)
        self.assertEqual(next(iter(summary)), "Archivo")
        # El saldo inicial es el que declara la fila `SALDO ANTERIOR`.
        self.assertEqual(summary["Saldo inicial"], Decimal("100.00"))
        self.assertEqual(summary["Total cargos"], Decimal("10.00"))
        self.assertEqual(summary["Total abonos"], Decimal("0"))
        self.assertEqual(summary["Saldo final"], Decimal("90.00"))
        self.assertNotIsInstance(summary["Total cargos"], float)

    def test_row_types_use_the_same_spanish_labels_as_bbva(self) -> None:
        plan = build_bcp_workbook_plan(_result())

        self.assertEqual(
            tuple(row[1] for row in _sheet(plan, "Movimientos").rows),
            ("SALDO_ANTERIOR", "MOVIMIENTO", "TOTAL_MOVIMIENTO", "SALDO"),
        )

    def test_page_control_counts_published_rows_and_columns(self) -> None:
        plan = build_bcp_workbook_plan(_result())
        page_control = _sheet(plan, "Control_Paginas")

        self.assertEqual(
            tuple(column.header for column in page_control.columns),
            ("Página", "Filas extraídas", "Columnas extraídas", "Cabecera detectada"),
        )
        # Cuatro filas en `Movimientos`; fechas, descripción, cargo, abono y saldo.
        self.assertEqual(page_control.rows, ((1, 4, 6, True),))

    def test_account_header_fills_encabezado_and_the_account_type(self) -> None:
        header = BcpStatementHeader(
            account_product="Cuenta de Ahorros CLASICA",
            account_type=AccountType.SAVINGS,
            holder="EMPRESA SINTETICA S.A.C.",
            address="AV. FICTICIA 123",
            account_code="191-00000000-0-00",
            currency_label="SOLES",
            period="DEL 01/04/26 AL 30/04/26",
            period_start=date(2026, 4, 1),
            period_end=date(2026, 4, 30),
            first_page=1,
            declared_pages=3,
        )
        plan = build_bcp_workbook_plan(_result(header=header))

        fields = dict(_sheet(plan, "Encabezado").rows)
        self.assertEqual(fields["Banco"], "BCP")
        self.assertEqual(fields["Tipo de cuenta"], "Cuenta de Ahorros CLASICA")
        self.assertEqual(fields["Titular"], "EMPRESA SINTETICA S.A.C.")
        self.assertEqual(fields["Código de cuenta"], "191-00000000-0-00")
        self.assertEqual(fields["Periodo"], "DEL 01/04/26 AL 30/04/26")
        self.assertEqual(fields["Fecha inicio"], "01/04/2026")
        self.assertEqual(fields["Fecha fin"], "30/04/2026")
        self.assertEqual(fields["Total de páginas declarado"], "3")
        summary = _sheet(plan, "Resumen")
        headers = [column.header for column in summary.columns]
        self.assertEqual(summary.rows[0][headers.index("Tipo de cuenta")], "AHORRO")

    def test_header_not_found_leaves_values_blank(self) -> None:
        plan = build_bcp_workbook_plan(_result())

        fields = dict(_sheet(plan, "Encabezado").rows)
        self.assertEqual(fields["Banco"], "BCP")
        self.assertTrue(all(value is None for key, value in fields.items() if key != "Banco"))

    def test_neutralizes_untrusted_descriptions_before_export(self) -> None:
        plan = build_bcp_workbook_plan(_result())

        movement_description = _sheet(plan, "Movimientos").rows[1][4]
        self.assertEqual(movement_description, '\'=HYPERLINK("unsafe")')

    def test_allows_reviewable_results_and_counts_their_warnings(self) -> None:
        plan = build_bcp_workbook_plan(_result(status=ExtractionStatus.NEEDS_REVIEW))

        summary = _sheet(plan, "Resumen")
        headers = [column.header for column in summary.columns]
        # Los códigos los publica la API; el libro dice cuántas advertencias hubo.
        self.assertEqual(summary.rows[0][headers.index("Advertencias")], 1)

    def test_rejects_failed_extractions(self) -> None:
        failed = _result(status=ExtractionStatus.FAILED)

        with self.assertRaises(UnexportableStatementError):
            build_bcp_workbook_plan(failed)

    def test_rejects_plan_shape_type_and_row_limit_violations(self) -> None:
        column = SpreadsheetColumn(
            key="value",
            header="Valor",
            cell_type=SpreadsheetCellType.INTEGER,
            width=10,
        )
        invalid_type = WorkbookPlan(
            schema_id="eecc.statement.test",
            schema_version=1,
            sheets=(
                SpreadsheetSheet(
                    name="Datos",
                    table_name="DatosEstadoCuenta",
                    columns=(column,),
                    rows=((Decimal("1"),),),
                ),
            ),
        )
        with self.assertRaises(InvalidWorkbookDataError):
            validate_workbook_plan(invalid_type)

        too_many_rows = replace(
            invalid_type,
            sheets=(replace(invalid_type.sheets[0], rows=((1,), (2,))),),
        )
        with self.assertRaises(InvalidWorkbookDataError):
            validate_workbook_plan(too_many_rows, max_rows_per_sheet=2)

    def test_rejects_unsafe_text_not_passed_through_sanitizer(self) -> None:
        plan = WorkbookPlan(
            schema_id="eecc.statement.test",
            schema_version=1,
            sheets=(
                SpreadsheetSheet(
                    name="Datos",
                    table_name="DatosEstadoCuenta",
                    columns=(
                        SpreadsheetColumn(
                            key="description",
                            header="Descripción",
                            cell_type=SpreadsheetCellType.TEXT,
                            width=20,
                        ),
                    ),
                    rows=(("=1+1",),),
                ),
            ),
        )

        with self.assertRaises(InvalidWorkbookDataError):
            validate_workbook_plan(plan)
