"""Mapeo Interbank hacia un contrato XLSX versionado y seguro.

Los rótulos de importes siguen al documento (`Ingresos`, `Gastos`, `Saldo contable`)
para que quien compara el Excel con el PDF no tenga que traducir columnas. No se
exportan titular, documento de identidad ni número de cuenta.
"""

from __future__ import annotations

from statement_worker.domain.errors import UnexportableStatementError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.interbank.models import (
    InterbankProcessingResult,
    InterbankRowType,
)
from statement_worker.extractors.interbank.validation import InterbankValidationReport

from .workbook import (
    SpreadsheetCellType,
    SpreadsheetCellValue,
    SpreadsheetColumn,
    SpreadsheetSheet,
    WorkbookPlan,
    sanitize_spreadsheet_text,
    validate_workbook_plan,
)

INTERBANK_WORKBOOK_SCHEMA_ID = "eecc.statement.interbank"
INTERBANK_WORKBOOK_SCHEMA_VERSION = 1
_FINANCIAL_FORMAT = "#,##0.00;[Red](#,##0.00);-"

_SUMMARY_COLUMNS = (
    SpreadsheetColumn("status", "Estado", SpreadsheetCellType.TEXT, 16),
    SpreadsheetColumn("extractor", "Extractor", SpreadsheetCellType.TEXT, 24),
    SpreadsheetColumn("version", "Versión", SpreadsheetCellType.TEXT, 12),
    SpreadsheetColumn("confidence", "Confianza", SpreadsheetCellType.DECIMAL, 12, "0.00%"),
    SpreadsheetColumn("currency", "Moneda", SpreadsheetCellType.TEXT, 10),
    SpreadsheetColumn("pages", "Páginas", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    SpreadsheetColumn("movements", "Movimientos", SpreadsheetCellType.INTEGER, 14, "#,##0"),
    SpreadsheetColumn(
        "opening", "Saldo inicial", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT
    ),
    SpreadsheetColumn(
        "credits", "Total ingresos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT
    ),
    SpreadsheetColumn("debits", "Total gastos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("closing", "Saldo final", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("warnings", "Advertencias", SpreadsheetCellType.INTEGER, 14, "#,##0"),
)

_MOVEMENT_COLUMNS = (
    SpreadsheetColumn("page", "Página", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    SpreadsheetColumn("posting_date", "Fecha", SpreadsheetCellType.DATE, 14, "yyyy-mm-dd"),
    SpreadsheetColumn("description", "Concepto", SpreadsheetCellType.TEXT, 40),
    SpreadsheetColumn("credit", "Ingresos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("debit", "Gastos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn(
        "balance", "Saldo contable", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT
    ),
)

_PAGE_COLUMNS = (
    SpreadsheetColumn("page", "Página", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    SpreadsheetColumn("words", "Palabras", SpreadsheetCellType.INTEGER, 12, "#,##0"),
    SpreadsheetColumn("rows", "Filas visuales", SpreadsheetCellType.INTEGER, 15, "#,##0"),
    SpreadsheetColumn("header", "Cabecera detectada", SpreadsheetCellType.BOOLEAN, 20),
    SpreadsheetColumn("guide", "Página de guía", SpreadsheetCellType.BOOLEAN, 18),
)

_VALIDATION_COLUMNS = (
    SpreadsheetColumn("kind", "Tipo", SpreadsheetCellType.TEXT, 14),
    SpreadsheetColumn("code", "Código", SpreadsheetCellType.TEXT, 44),
    SpreadsheetColumn("status", "Estado", SpreadsheetCellType.TEXT, 16),
)


def build_interbank_workbook_plan(
    result: InterbankProcessingResult,
    report: InterbankValidationReport,
) -> WorkbookPlan:
    if report.status is ExtractionStatus.FAILED:
        raise UnexportableStatementError("A failed statement extraction cannot be exported")

    document = result.document
    movements = tuple(row for row in document.rows if row.row_type is InterbankRowType.MOVEMENT)

    summary_row: tuple[SpreadsheetCellValue, ...] = (
        sanitize_spreadsheet_text(report.status.value),
        sanitize_spreadsheet_text(result.detection.extractor_id),
        sanitize_spreadsheet_text(result.detection.extractor_version),
        result.detection.confidence,
        document.currency,
        len(document.page_metrics),
        len(movements),
        report.opening_balance,
        report.total_credits,
        report.total_debits,
        report.closing_balance,
        len(report.warning_codes),
    )

    movement_rows: tuple[tuple[SpreadsheetCellValue, ...], ...] = tuple(
        (
            row.page,
            row.posting_date,
            sanitize_spreadsheet_text(row.description),
            row.credit,
            row.debit,
            row.balance,
        )
        for row in movements
    )

    validation_rows = tuple(
        (
            "CHECK",
            sanitize_spreadsheet_text(check.code.value),
            sanitize_spreadsheet_text(check.status.value),
        )
        for check in report.checks
    ) + tuple(
        ("WARNING", sanitize_spreadsheet_text(code.value), "PRESENT")
        for code in report.warning_codes
    )

    plan = WorkbookPlan(
        schema_id=INTERBANK_WORKBOOK_SCHEMA_ID,
        schema_version=INTERBANK_WORKBOOK_SCHEMA_VERSION,
        sheets=(
            SpreadsheetSheet("Resumen", "ResumenInterbank", _SUMMARY_COLUMNS, (summary_row,)),
            SpreadsheetSheet(
                "Movimientos", "MovimientosInterbank", _MOVEMENT_COLUMNS, movement_rows
            ),
            SpreadsheetSheet(
                "Control_Paginas",
                "ControlPaginasInterbank",
                _PAGE_COLUMNS,
                tuple(
                    (
                        metric.page,
                        metric.word_count,
                        metric.row_count,
                        metric.header_detected,
                        metric.guide_page,
                    )
                    for metric in document.page_metrics
                ),
            ),
            SpreadsheetSheet(
                "Validaciones", "ValidacionesInterbank", _VALIDATION_COLUMNS, validation_rows
            ),
        ),
    )
    validate_workbook_plan(plan)
    return plan
