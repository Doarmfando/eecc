"""Contrato XLSX del extractor genérico, separado del especializado por banco."""

from __future__ import annotations

from typing import TYPE_CHECKING

from statement_worker.domain.models import Detection

from .workbook import (
    SpreadsheetCellType,
    SpreadsheetCellValue,
    SpreadsheetColumn,
    SpreadsheetSheet,
    WorkbookPlan,
    sanitize_spreadsheet_text,
    validate_workbook_plan,
)

if TYPE_CHECKING:
    from statement_worker.extractors.generic.rows import GenericParsedRow
    from statement_worker.extractors.generic.validation import GenericValidationReport

GENERIC_WORKBOOK_SCHEMA_ID = "eecc.statement.generic"
GENERIC_WORKBOOK_SCHEMA_VERSION = 1
_FINANCIAL_FORMAT = "#,##0.00;[Red](#,##0.00);-"

_MOVEMENT_COLUMNS = (
    SpreadsheetColumn("page", "Página", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    SpreadsheetColumn("posting_date", "Fecha", SpreadsheetCellType.DATE, 15, "yyyy-mm-dd"),
    SpreadsheetColumn("value_date", "Fecha valor", SpreadsheetCellType.DATE, 15, "yyyy-mm-dd"),
    SpreadsheetColumn("description", "Descripción", SpreadsheetCellType.TEXT, 48),
    SpreadsheetColumn("reference", "Referencia", SpreadsheetCellType.TEXT, 22),
    SpreadsheetColumn("debit", "Cargo", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("credit", "Abono", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("balance", "Saldo", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
)

_SUMMARY_COLUMNS = (
    SpreadsheetColumn("status", "Estado", SpreadsheetCellType.TEXT, 16),
    SpreadsheetColumn("extractor", "Extractor", SpreadsheetCellType.TEXT, 22),
    SpreadsheetColumn("version", "Versión", SpreadsheetCellType.TEXT, 12),
    SpreadsheetColumn("confidence", "Confianza", SpreadsheetCellType.DECIMAL, 12, "0.00%"),
    SpreadsheetColumn("rows", "Movimientos", SpreadsheetCellType.INTEGER, 14, "#,##0"),
    SpreadsheetColumn("verified", "Saldos verificados", SpreadsheetCellType.INTEGER, 20, "#,##0"),
    SpreadsheetColumn("warnings", "Advertencias", SpreadsheetCellType.INTEGER, 14, "#,##0"),
)

_VALIDATION_COLUMNS = (
    SpreadsheetColumn("kind", "Tipo", SpreadsheetCellType.TEXT, 14),
    SpreadsheetColumn("code", "Código", SpreadsheetCellType.TEXT, 44),
    SpreadsheetColumn("status", "Estado", SpreadsheetCellType.TEXT, 16),
)


def build_generic_workbook_plan(
    detection: Detection,
    rows: tuple[GenericParsedRow, ...],
    report: GenericValidationReport,
) -> WorkbookPlan:
    """El esquema declara que la lectura no proviene de una plantilla conocida."""

    movement_rows: tuple[tuple[SpreadsheetCellValue, ...], ...] = tuple(
        (
            row.page,
            row.posting_date,
            row.value_date,
            sanitize_spreadsheet_text(row.description),
            sanitize_spreadsheet_text(row.reference or ""),
            row.debit,
            row.credit,
            row.balance,
        )
        for row in rows
    )

    summary_row: tuple[SpreadsheetCellValue, ...] = (
        sanitize_spreadsheet_text(report.status.value),
        sanitize_spreadsheet_text(detection.extractor_id),
        sanitize_spreadsheet_text(detection.extractor_version),
        detection.confidence,
        len(rows),
        report.verified_transitions,
        len(report.warning_codes),
    )

    validation_rows = tuple(
        (
            "CHECK",
            sanitize_spreadsheet_text(check.code.value),
            sanitize_spreadsheet_text(check.status.value),
        )
        for check in report.checks
    ) + tuple(
        ("WARNING", sanitize_spreadsheet_text(code), "PRESENT") for code in report.warning_codes
    )

    plan = WorkbookPlan(
        schema_id=GENERIC_WORKBOOK_SCHEMA_ID,
        schema_version=GENERIC_WORKBOOK_SCHEMA_VERSION,
        sheets=(
            SpreadsheetSheet("Resumen", "ResumenGenerico", _SUMMARY_COLUMNS, (summary_row,)),
            SpreadsheetSheet(
                "Movimientos", "MovimientosGenerico", _MOVEMENT_COLUMNS, movement_rows
            ),
            SpreadsheetSheet(
                "Validaciones", "ValidacionesGenerico", _VALIDATION_COLUMNS, validation_rows
            ),
        ),
    )
    validate_workbook_plan(plan)
    return plan
