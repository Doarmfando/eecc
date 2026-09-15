"""Mapeo Banco de la Nación hacia un contrato XLSX versionado y seguro.

Los rótulos de importes son los habituales del banco (`Cargos`, `Abonos`, `Saldo`).
No se exportan titular, documento de identidad ni número de cuenta.
"""

from __future__ import annotations

from statement_worker.domain.errors import UnexportableStatementError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.banco_nacion.models import (
    BancoNacionProcessingResult,
    BancoNacionRowType,
)
from statement_worker.extractors.banco_nacion.validation import BancoNacionValidationReport

from .workbook import (
    SpreadsheetCellType,
    SpreadsheetCellValue,
    SpreadsheetColumn,
    SpreadsheetSheet,
    WorkbookPlan,
    sanitize_spreadsheet_text,
    validate_workbook_plan,
)

BANCO_NACION_WORKBOOK_SCHEMA_ID = "eecc.statement.banco_nacion"
BANCO_NACION_WORKBOOK_SCHEMA_VERSION = 1
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
        "credits", "Total abonos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT
    ),
    SpreadsheetColumn("debits", "Total cargos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("closing", "Saldo final", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("warnings", "Advertencias", SpreadsheetCellType.INTEGER, 14, "#,##0"),
)

_MOVEMENT_COLUMNS = (
    SpreadsheetColumn("page", "Página", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    SpreadsheetColumn("posting_date", "Fecha", SpreadsheetCellType.DATE, 14, "yyyy-mm-dd"),
    SpreadsheetColumn("value_date", "Fecha valor", SpreadsheetCellType.DATE, 14, "yyyy-mm-dd"),
    SpreadsheetColumn("description", "Descripción", SpreadsheetCellType.TEXT, 48),
    SpreadsheetColumn("debit", "Cargos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("credit", "Abonos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("balance", "Saldo", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
)

_PAGE_COLUMNS = (
    SpreadsheetColumn("page", "Página", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    SpreadsheetColumn("words", "Palabras", SpreadsheetCellType.INTEGER, 12, "#,##0"),
    SpreadsheetColumn("rows", "Filas visuales", SpreadsheetCellType.INTEGER, 15, "#,##0"),
    SpreadsheetColumn("header", "Cabecera detectada", SpreadsheetCellType.BOOLEAN, 20),
)

_VALIDATION_COLUMNS = (
    SpreadsheetColumn("kind", "Tipo", SpreadsheetCellType.TEXT, 14),
    SpreadsheetColumn("code", "Código", SpreadsheetCellType.TEXT, 44),
    SpreadsheetColumn("status", "Estado", SpreadsheetCellType.TEXT, 16),
)


def build_banco_nacion_workbook_plan(
    result: BancoNacionProcessingResult,
    report: BancoNacionValidationReport,
) -> WorkbookPlan:
    if report.status is ExtractionStatus.FAILED:
        raise UnexportableStatementError("A failed statement extraction cannot be exported")

    document = result.document
    movements = tuple(row for row in document.rows if row.row_type is BancoNacionRowType.MOVEMENT)

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
            row.value_date,
            sanitize_spreadsheet_text(row.description),
            row.debit,
            row.credit,
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
        schema_id=BANCO_NACION_WORKBOOK_SCHEMA_ID,
        schema_version=BANCO_NACION_WORKBOOK_SCHEMA_VERSION,
        sheets=(
            SpreadsheetSheet("Resumen", "ResumenBancoNacion", _SUMMARY_COLUMNS, (summary_row,)),
            SpreadsheetSheet(
                "Movimientos", "MovimientosBancoNacion", _MOVEMENT_COLUMNS, movement_rows
            ),
            SpreadsheetSheet(
                "Control_Paginas",
                "ControlPaginasBancoNacion",
                _PAGE_COLUMNS,
                tuple(
                    (metric.page, metric.word_count, metric.row_count, metric.header_detected)
                    for metric in document.page_metrics
                ),
            ),
            SpreadsheetSheet(
                "Validaciones", "ValidacionesBancoNacion", _VALIDATION_COLUMNS, validation_rows
            ),
        ),
    )
    validate_workbook_plan(plan)
    return plan
