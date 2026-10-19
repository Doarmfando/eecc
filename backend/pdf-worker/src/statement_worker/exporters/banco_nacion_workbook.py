"""Mapeo Banco de la Nación hacia un contrato XLSX versionado y seguro.

Los rótulos de importes son los habituales del banco (`Cargos`, `Abonos`, `Saldo`).
Las hojas son las de BBVA y BCP (ADR-0015): `Encabezado` con los datos de la cuenta
que imprime la cabecera y `Movimientos` con el tipo de fila, saldos y totales
incluidos. El documento no declara su moneda: la celda queda vacía.
"""

from __future__ import annotations

from statement_worker.domain.errors import UnexportableStatementError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.banco_nacion.models import (
    BancoNacionParsedRow,
    BancoNacionProcessingResult,
    BancoNacionRowType,
    BancoNacionStatementHeader,
)
from statement_worker.extractors.banco_nacion.validation import BancoNacionValidationReport

from .workbook import (
    ACCOUNT_HEADER_COLUMNS,
    PAGE_CONTROL_COLUMNS,
    SpreadsheetCellType,
    SpreadsheetCellValue,
    SpreadsheetColumn,
    SpreadsheetSheet,
    WorkbookPlan,
    account_header_rows,
    group_cells_by_page,
    page_control_row,
    sanitize_spreadsheet_text,
    signed_amount,
    signed_amount_column,
    source_file_column,
    validate_workbook_plan,
)

BANCO_NACION_WORKBOOK_SCHEMA_ID = "eecc.statement.banco_nacion"
BANCO_NACION_WORKBOOK_SCHEMA_VERSION = 3
_FINANCIAL_FORMAT = "#,##0.00;[Red](#,##0.00);-"

# Los mismos rótulos que BCP y BBVA. `VAN`/`VIENEN` arrastran el saldo entre páginas.
_ROW_TYPE_LABELS = {
    BancoNacionRowType.OPENING_BALANCE: "SALDO_ANTERIOR",
    BancoNacionRowType.MOVEMENT: "MOVIMIENTO",
    BancoNacionRowType.CARRIED_BALANCE: "SALDO_ARRASTRADO",
    BancoNacionRowType.DECLARED_TOTALS: "TOTAL_MOVIMIENTO",
    BancoNacionRowType.CLOSING_BALANCE: "SALDO",
}

_SUMMARY_COLUMNS = (
    source_file_column(),
    SpreadsheetColumn("account_type", "Tipo de cuenta", SpreadsheetCellType.TEXT, 16),
    SpreadsheetColumn("currency", "Moneda", SpreadsheetCellType.TEXT, 10),
    SpreadsheetColumn("pages", "Páginas", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    SpreadsheetColumn("rows", "Filas", SpreadsheetCellType.INTEGER, 10, "#,##0"),
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
    SpreadsheetColumn("type", "Tipo de fila", SpreadsheetCellType.TEXT, 20),
    SpreadsheetColumn("posting_date", "Fecha", SpreadsheetCellType.DATE, 14, "yyyy-mm-dd"),
    SpreadsheetColumn("value_date", "Fecha valor", SpreadsheetCellType.DATE, 14, "yyyy-mm-dd"),
    SpreadsheetColumn("description", "Descripción", SpreadsheetCellType.TEXT, 48),
    signed_amount_column(_FINANCIAL_FORMAT),
    SpreadsheetColumn("debit", "Cargos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("credit", "Abonos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("balance", "Saldo", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
)


def _header_rows(
    header: BancoNacionStatementHeader,
) -> tuple[tuple[SpreadsheetCellValue, ...], ...]:
    return account_header_rows(
        (
            ("Banco", "Banco de la Nación"),
            ("Tipo de cuenta", header.account_product),
            ("Titular", header.holder),
            ("Dirección", header.address),
            ("Código de cliente", header.client_code),
            ("Nombre de cuenta", header.account_name),
            ("Número de cuenta", header.account_number),
            (
                "Fecha del estado",
                header.statement_date.strftime("%d/%m/%Y") if header.statement_date else "",
            ),
            ("Fecha de impresión", header.printed_at),
            ("Página inicial", str(header.first_page) if header.first_page else ""),
        )
    )


def _document_cells(row: BancoNacionParsedRow) -> tuple[SpreadsheetCellValue, ...]:
    """Lo leído del documento; `Cargo/Abono` se deriva y no cuenta como columna extraída."""

    return (
        row.posting_date,
        row.value_date,
        row.description or None,
        row.debit,
        row.credit,
        row.balance,
    )


def build_banco_nacion_workbook_plan(
    result: BancoNacionProcessingResult,
    report: BancoNacionValidationReport,
) -> WorkbookPlan:
    if report.status is ExtractionStatus.FAILED:
        raise UnexportableStatementError("A failed statement extraction cannot be exported")

    document = result.document
    movements = tuple(row for row in document.rows if row.row_type is BancoNacionRowType.MOVEMENT)
    header = result.header

    summary_row: tuple[SpreadsheetCellValue, ...] = (
        None,
        header.account_type.value if header.account_type else None,
        document.currency,
        len(document.page_metrics),
        len(document.rows),
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
            _ROW_TYPE_LABELS[row.row_type],
            row.posting_date,
            row.value_date,
            sanitize_spreadsheet_text(row.description),
            signed_amount(row.debit, row.credit),
            row.debit,
            row.credit,
            row.balance,
        )
        for row in document.rows
    )

    cells_by_page = group_cells_by_page((row.page, _document_cells(row)) for row in document.rows)
    page_rows = tuple(
        page_control_row(metric.page, metric.header_detected, cells_by_page)
        for metric in document.page_metrics
    )

    plan = WorkbookPlan(
        schema_id=BANCO_NACION_WORKBOOK_SCHEMA_ID,
        schema_version=BANCO_NACION_WORKBOOK_SCHEMA_VERSION,
        sheets=(
            SpreadsheetSheet("Resumen", "ResumenBancoNacion", _SUMMARY_COLUMNS, (summary_row,)),
            SpreadsheetSheet(
                "Encabezado", "EncabezadoBancoNacion", ACCOUNT_HEADER_COLUMNS, _header_rows(header)
            ),
            SpreadsheetSheet(
                "Movimientos", "MovimientosBancoNacion", _MOVEMENT_COLUMNS, movement_rows
            ),
            SpreadsheetSheet(
                "Control_Paginas", "ControlPaginasBancoNacion", PAGE_CONTROL_COLUMNS, page_rows
            ),
        ),
    )
    validate_workbook_plan(plan)
    return plan
