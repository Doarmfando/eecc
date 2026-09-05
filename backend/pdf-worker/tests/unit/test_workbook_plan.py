from dataclasses import replace
from datetime import date
from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.errors import InvalidWorkbookDataError, UnexportableStatementError
from statement_worker.domain.models import Detection, ExtractionStatus
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
    BcpWarningCode,
)
from statement_worker.extractors.bcp.validation import (
    BcpCheckStatus,
    BcpInvariantCode,
    BcpInvariantResult,
    BcpValidationReport,
)


def _result(*, status: ExtractionStatus = ExtractionStatus.SUCCEEDED) -> BcpPdfProcessingResult:
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
        self.assertEqual(plan.schema_version, 1)
        self.assertEqual(
            tuple(sheet.name for sheet in plan.sheets),
            ("Resumen", "Movimientos", "Control_Paginas", "Validaciones"),
        )
        summary = plan.sheets[0].rows[0]
        self.assertEqual(summary[3], Decimal("0.95"))
        self.assertEqual(summary[7], Decimal("10.00"))
        self.assertEqual(summary[8], Decimal("0"))
        self.assertEqual(summary[9], Decimal("90.00"))
        self.assertNotIsInstance(summary[7], float)

    def test_neutralizes_untrusted_descriptions_before_export(self) -> None:
        plan = build_bcp_workbook_plan(_result())

        movement_description = plan.sheets[1].rows[1][4]
        self.assertEqual(movement_description, '\'=HYPERLINK("unsafe")')

    def test_allows_reviewable_results_and_exports_warning_codes(self) -> None:
        plan = build_bcp_workbook_plan(_result(status=ExtractionStatus.NEEDS_REVIEW))

        validation_rows = plan.sheets[3].rows
        self.assertIn(("WARNING", "BCP_DECLARED_TOTAL_MISMATCH", "PRESENT"), validation_rows)

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
