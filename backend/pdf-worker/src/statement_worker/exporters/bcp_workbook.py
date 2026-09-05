"""Mapeo BCP hacia un contrato XLSX versionado y seguro."""

from __future__ import annotations

from decimal import Decimal

from statement_worker.domain.errors import UnexportableStatementError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.bcp.document_processor import BcpPdfProcessingResult
from statement_worker.extractors.bcp.models import BcpParsedRow, BcpRowType

from .workbook import (
    SpreadsheetCellType,
    SpreadsheetCellValue,
    SpreadsheetColumn,
    SpreadsheetSheet,
    WorkbookPlan,
    sanitize_spreadsheet_text,
    validate_workbook_plan,
)

BCP_WORKBOOK_SCHEMA_ID = "eecc.statement.bcp"
BCP_WORKBOOK_SCHEMA_VERSION = 1
_FINANCIAL_FORMAT = "#,##0.00;[Red](#,##0.00);-"


def _column(
    key: str,
    header: str,
    cell_type: SpreadsheetCellType,
    width: int,
    number_format: str | None = None,
) -> SpreadsheetColumn:
    return SpreadsheetColumn(
        key=key,
        header=header,
        cell_type=cell_type,
        width=width,
        number_format=number_format,
    )


_SUMMARY_COLUMNS = (
    _column("status", "Estado", SpreadsheetCellType.TEXT, 16),
    _column("extractor", "Extractor", SpreadsheetCellType.TEXT, 22),
    _column("version", "Versión", SpreadsheetCellType.TEXT, 12),
    _column("confidence", "Confianza", SpreadsheetCellType.DECIMAL, 12, "0.00%"),
    _column("pages", "Páginas", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    _column("rows", "Filas", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    _column("movements", "Movimientos", SpreadsheetCellType.INTEGER, 14, "#,##0"),
    _column("debits", "Total cargos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    _column("credits", "Total abonos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    _column("balance", "Saldo final", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    _column("warnings", "Advertencias", SpreadsheetCellType.INTEGER, 14, "#,##0"),
)

_MOVEMENT_COLUMNS = (
    _column("page", "Página", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    _column("type", "Tipo de fila", SpreadsheetCellType.TEXT, 20),
    _column("posting_date", "Fecha proceso", SpreadsheetCellType.DATE, 15, "yyyy-mm-dd"),
    _column("value_date", "Fecha valor", SpreadsheetCellType.DATE, 15, "yyyy-mm-dd"),
    _column("description", "Descripción", SpreadsheetCellType.TEXT, 48),
    _column("debit", "Cargo", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    _column("credit", "Abono", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    _column("balance", "Saldo", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
)

_PAGE_COLUMNS = (
    _column("page", "Página", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    _column("words", "Palabras", SpreadsheetCellType.INTEGER, 12, "#,##0"),
    _column("rows", "Filas visuales", SpreadsheetCellType.INTEGER, 15, "#,##0"),
    _column("header", "Cabecera detectada", SpreadsheetCellType.BOOLEAN, 20),
    _column("footer", "Pie detectado", SpreadsheetCellType.BOOLEAN, 18),
)

_VALIDATION_COLUMNS = (
    _column("kind", "Tipo", SpreadsheetCellType.TEXT, 14),
    _column("code", "Código", SpreadsheetCellType.TEXT, 44),
    _column("status", "Estado", SpreadsheetCellType.TEXT, 16),
)


def _amount_or_zero(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal("0")


def _movement_rows(
    rows: tuple[BcpParsedRow, ...],
) -> tuple[tuple[SpreadsheetCellValue, ...], ...]:
    return tuple(
        (
            row.page,
            sanitize_spreadsheet_text(row.row_type.value),
            row.posting_date,
            row.value_date,
            sanitize_spreadsheet_text(row.description),
            row.debit,
            row.credit,
            row.balance,
        )
        for row in rows
    )


def build_bcp_workbook_plan(result: BcpPdfProcessingResult) -> WorkbookPlan:
    """Construye el plan solo para resultados bancarios utilizables."""

    if result.validation.status is ExtractionStatus.FAILED:
        raise UnexportableStatementError("A failed statement extraction cannot be exported")

    movements = tuple(row for row in result.rows if row.row_type is BcpRowType.MOVEMENT)
    final_balances = tuple(row.balance for row in result.rows if row.row_type is BcpRowType.BALANCE)
    summary_row = (
        sanitize_spreadsheet_text(result.validation.status.value),
        sanitize_spreadsheet_text(result.detection.extractor_id),
        sanitize_spreadsheet_text(result.detection.extractor_version),
        result.detection.confidence,
        len(result.page_metrics),
        len(result.rows),
        len(movements),
        sum((_amount_or_zero(row.debit) for row in movements), start=Decimal("0")),
        sum((_amount_or_zero(row.credit) for row in movements), start=Decimal("0")),
        final_balances[-1] if final_balances else None,
        len(result.validation.warning_codes),
    )

    validation_rows = tuple(
        (
            "CHECK",
            sanitize_spreadsheet_text(check.code.value),
            sanitize_spreadsheet_text(check.status.value),
        )
        for check in result.validation.checks
    ) + tuple(
        (
            "WARNING",
            sanitize_spreadsheet_text(warning.value),
            "PRESENT",
        )
        for warning in result.validation.warning_codes
    )

    plan = WorkbookPlan(
        schema_id=BCP_WORKBOOK_SCHEMA_ID,
        schema_version=BCP_WORKBOOK_SCHEMA_VERSION,
        sheets=(
            SpreadsheetSheet(
                name="Resumen",
                table_name="ResumenEstadoCuenta",
                columns=_SUMMARY_COLUMNS,
                rows=(summary_row,),
            ),
            SpreadsheetSheet(
                name="Movimientos",
                table_name="MovimientosEstadoCuenta",
                columns=_MOVEMENT_COLUMNS,
                rows=_movement_rows(result.rows),
            ),
            SpreadsheetSheet(
                name="Control_Paginas",
                table_name="ControlPaginasEstadoCuenta",
                columns=_PAGE_COLUMNS,
                rows=tuple(
                    (
                        metric.page,
                        metric.word_count,
                        metric.row_count,
                        metric.header_detected,
                        metric.footer_detected,
                    )
                    for metric in result.page_metrics
                ),
            ),
            SpreadsheetSheet(
                name="Validaciones",
                table_name="ValidacionesEstadoCuenta",
                columns=_VALIDATION_COLUMNS,
                rows=validation_rows,
            ),
        ),
    )
    validate_workbook_plan(plan)
    return plan
