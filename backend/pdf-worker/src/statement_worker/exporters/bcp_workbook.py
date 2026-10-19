"""Mapeo BCP hacia un contrato XLSX versionado y seguro.

Las mismas hojas que BBVA (ADR-0013, ADR-0015): `Resumen`, `Encabezado` con los
datos de la cuenta que imprime la cabecera, `Movimientos` con el tipo de fila en
español y `Control_Paginas` con filas y columnas extraídas. Las invariantes no van
en el libro: las publica la API y las muestra la interfaz.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from statement_worker.domain.errors import UnexportableStatementError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.bcp.document_processor import BcpPdfProcessingResult
from statement_worker.extractors.bcp.models import BcpParsedRow, BcpRowType, BcpStatementHeader

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

BCP_WORKBOOK_SCHEMA_ID = "eecc.statement.bcp"
BCP_WORKBOOK_SCHEMA_VERSION = 3
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


# Lo que la hoja `Movimientos` dice de cada fila, con los mismos rótulos que BBVA.
_ROW_TYPE_LABELS = {
    BcpRowType.PREVIOUS_BALANCE: "SALDO_ANTERIOR",
    BcpRowType.MOVEMENT: "MOVIMIENTO",
    BcpRowType.MOVEMENT_TOTAL: "TOTAL_MOVIMIENTO",
    BcpRowType.BALANCE: "SALDO",
    BcpRowType.CONTINUATION: "CONTINUACION",
    BcpRowType.UNCLASSIFIED: "NO_CLASIFICADA",
}

# El nombre del PDF y el saldo inicial, sin estado, extractor, versión ni
# confianza: esos datos técnicos ya los publica la API (ADR-0013).
_SUMMARY_COLUMNS = (
    source_file_column(),
    _column("account_type", "Tipo de cuenta", SpreadsheetCellType.TEXT, 16),
    _column("currency", "Moneda", SpreadsheetCellType.TEXT, 10),
    _column("pages", "Páginas", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    _column("rows", "Filas", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    _column("movements", "Movimientos", SpreadsheetCellType.INTEGER, 14, "#,##0"),
    _column("opening", "Saldo inicial", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
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
    signed_amount_column(_FINANCIAL_FORMAT),
    _column("debit", "Cargo", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    _column("credit", "Abono", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    _column("balance", "Saldo", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
)


def _amount_or_zero(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal("0")


def _short_date(value: date | None) -> str:
    return value.strftime("%d/%m/%Y") if value else ""


def _header_rows(header: BcpStatementHeader) -> tuple[tuple[SpreadsheetCellValue, ...], ...]:
    return account_header_rows(
        (
            ("Banco", "BCP"),
            ("Tipo de cuenta", header.account_product),
            ("Titular", header.holder),
            ("Dirección", header.address),
            ("Código de cuenta", header.account_code),
            ("Moneda", header.currency_label),
            ("Periodo", header.period),
            ("Fecha inicio", _short_date(header.period_start)),
            ("Fecha fin", _short_date(header.period_end)),
            ("Página inicial", str(header.first_page) if header.first_page else ""),
            (
                "Total de páginas declarado",
                str(header.declared_pages) if header.declared_pages else "",
            ),
        )
    )


def _document_cells(row: BcpParsedRow) -> tuple[SpreadsheetCellValue, ...]:
    """Las celdas que salen del documento, sin la página ni el tipo."""

    return (
        row.posting_date,
        row.value_date,
        row.description or None,
        row.debit,
        row.credit,
        row.balance,
    )


def _movement_rows(
    rows: tuple[BcpParsedRow, ...],
) -> tuple[tuple[SpreadsheetCellValue, ...], ...]:
    return tuple(
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
        for row in rows
    )


def build_bcp_workbook_plan(result: BcpPdfProcessingResult) -> WorkbookPlan:
    """Construye el plan solo para resultados bancarios utilizables."""

    if result.validation.status is ExtractionStatus.FAILED:
        raise UnexportableStatementError("A failed statement extraction cannot be exported")

    movements = tuple(row for row in result.rows if row.row_type is BcpRowType.MOVEMENT)
    final_balances = tuple(row.balance for row in result.rows if row.row_type is BcpRowType.BALANCE)
    # El que declara la fila `SALDO ANTERIOR`; sin ella queda en blanco, no se deduce.
    opening_balances = tuple(
        row.balance for row in result.rows if row.row_type is BcpRowType.PREVIOUS_BALANCE
    )
    summary_row: tuple[SpreadsheetCellValue, ...] = (
        None,
        result.header.account_type.value if result.header.account_type else None,
        result.currency,
        len(result.page_metrics),
        len(result.rows),
        len(movements),
        opening_balances[0] if opening_balances else None,
        sum((_amount_or_zero(row.debit) for row in movements), start=Decimal("0")),
        sum((_amount_or_zero(row.credit) for row in movements), start=Decimal("0")),
        final_balances[-1] if final_balances else None,
        len(result.validation.warning_codes),
    )

    cells_by_page = group_cells_by_page((row.page, _document_cells(row)) for row in result.rows)
    page_rows = tuple(
        page_control_row(metric.page, metric.header_detected, cells_by_page)
        for metric in result.page_metrics
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
                name="Encabezado",
                table_name="EncabezadoEstadoCuenta",
                columns=ACCOUNT_HEADER_COLUMNS,
                rows=_header_rows(result.header),
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
                columns=PAGE_CONTROL_COLUMNS,
                rows=page_rows,
            ),
        ),
    )
    validate_workbook_plan(plan)
    return plan
