"""Mapeo Interbank hacia un contrato XLSX versionado y seguro.

Los rótulos de importes siguen al documento (`Ingresos`, `Gastos`, `Saldo contable`)
para que quien compara el Excel con el PDF no tenga que traducir columnas. Las
hojas son las de BBVA y BCP (ADR-0015): `Encabezado` con los datos de la cuenta que
imprime la cabecera y `Movimientos` con el tipo de fila, saldo inicial y cierre
incluidos.
"""

from __future__ import annotations

from statement_worker.domain.errors import UnexportableStatementError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.interbank.models import (
    InterbankParsedRow,
    InterbankProcessingResult,
    InterbankRowType,
    InterbankStatementHeader,
)
from statement_worker.extractors.interbank.validation import InterbankValidationReport

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

INTERBANK_WORKBOOK_SCHEMA_ID = "eecc.statement.interbank"
INTERBANK_WORKBOOK_SCHEMA_VERSION = 3
_FINANCIAL_FORMAT = "#,##0.00;[Red](#,##0.00);-"

# Los mismos rótulos que BCP y BBVA. El cierre `SALDO CONTABLE AL` trae en una sola
# fila los totales y el saldo final, como la fila `SALDO` de los demás bancos.
_ROW_TYPE_LABELS = {
    InterbankRowType.OPENING_BALANCE: "SALDO_ANTERIOR",
    InterbankRowType.MOVEMENT: "MOVIMIENTO",
    InterbankRowType.CLOSING_TOTALS: "SALDO",
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
        "credits", "Total ingresos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT
    ),
    SpreadsheetColumn("debits", "Total gastos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("closing", "Saldo final", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("warnings", "Advertencias", SpreadsheetCellType.INTEGER, 14, "#,##0"),
)

_MOVEMENT_COLUMNS = (
    SpreadsheetColumn("page", "Página", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    SpreadsheetColumn("type", "Tipo de fila", SpreadsheetCellType.TEXT, 18),
    SpreadsheetColumn("posting_date", "Fecha", SpreadsheetCellType.DATE, 14, "yyyy-mm-dd"),
    SpreadsheetColumn("description", "Concepto", SpreadsheetCellType.TEXT, 40),
    signed_amount_column(_FINANCIAL_FORMAT),
    SpreadsheetColumn("credit", "Ingresos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("debit", "Gastos", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn(
        "balance", "Saldo contable", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT
    ),
)

# Las columnas comunes y, propia de Interbank, si la página es la guía de lectura
# que el banco intercala sin movimientos: explica por qué no tiene filas.
_PAGE_COLUMNS = (
    *PAGE_CONTROL_COLUMNS,
    SpreadsheetColumn("guide", "Página de guía", SpreadsheetCellType.BOOLEAN, 18),
)


def _header_rows(header: InterbankStatementHeader) -> tuple[tuple[SpreadsheetCellValue, ...], ...]:
    return account_header_rows(
        (
            ("Banco", "Interbank"),
            ("Tipo de cuenta", header.account_product),
            ("Titular", header.holder),
            ("Documento de identidad", header.identity_document),
            ("Número de cuenta", header.account_number),
            ("Moneda", header.currency_label),
            ("Periodo", header.period),
            (
                "Fecha de apertura",
                header.opened_on.strftime("%d/%m/%Y") if header.opened_on else "",
            ),
        )
    )


def _document_cells(row: InterbankParsedRow) -> tuple[SpreadsheetCellValue, ...]:
    """Lo leído del documento; `Cargo/Abono` se deriva y no cuenta como columna extraída."""

    return (row.posting_date, row.description or None, row.credit, row.debit, row.balance)


def build_interbank_workbook_plan(
    result: InterbankProcessingResult,
    report: InterbankValidationReport,
) -> WorkbookPlan:
    if report.status is ExtractionStatus.FAILED:
        raise UnexportableStatementError("A failed statement extraction cannot be exported")

    document = result.document
    movements = tuple(row for row in document.rows if row.row_type is InterbankRowType.MOVEMENT)
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
            sanitize_spreadsheet_text(row.description),
            signed_amount(row.debit, row.credit),
            row.credit,
            row.debit,
            row.balance,
        )
        for row in document.rows
    )

    cells_by_page = group_cells_by_page((row.page, _document_cells(row)) for row in document.rows)
    page_rows = tuple(
        (
            *page_control_row(metric.page, metric.header_detected, cells_by_page),
            metric.guide_page,
        )
        for metric in document.page_metrics
    )

    plan = WorkbookPlan(
        schema_id=INTERBANK_WORKBOOK_SCHEMA_ID,
        schema_version=INTERBANK_WORKBOOK_SCHEMA_VERSION,
        sheets=(
            SpreadsheetSheet("Resumen", "ResumenInterbank", _SUMMARY_COLUMNS, (summary_row,)),
            SpreadsheetSheet(
                "Encabezado", "EncabezadoInterbank", ACCOUNT_HEADER_COLUMNS, _header_rows(header)
            ),
            SpreadsheetSheet(
                "Movimientos", "MovimientosInterbank", _MOVEMENT_COLUMNS, movement_rows
            ),
            SpreadsheetSheet(
                "Control_Paginas", "ControlPaginasInterbank", _PAGE_COLUMNS, page_rows
            ),
        ),
    )
    validate_workbook_plan(plan)
    return plan
