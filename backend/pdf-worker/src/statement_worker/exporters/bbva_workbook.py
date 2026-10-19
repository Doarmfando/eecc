"""Mapeo BBVA hacia un contrato XLSX versionado y seguro.

Los rótulos siguen al documento (`Cargo/Abono`, `ITF`, `Saldo contable`) para que
quien compara el Excel con el PDF no tenga que traducir columnas. `Cargo/Abono`
conserva el signo, como lo imprime el banco, y se repite separado en `Cargo` y
`Abono` como en los demás bancos (ADR-0013). Los tres son brutos: el ITF va en su
propia columna y su propio total, porque es lo que permite cuadrar la cuenta.

`Encabezado` lleva los datos de la cuenta que imprime el banco —titular,
dirección, RUC, CCI y código de cuenta— porque el Excel es de su dueño y los
necesita para identificarlo (ADR-0012). Las invariantes no van en el libro: las
publica la API y las muestra la interfaz.
"""

from __future__ import annotations

from statement_worker.domain.errors import UnexportableStatementError
from statement_worker.domain.models import ExtractionStatus
from statement_worker.extractors.bbva.models import (
    BbvaParsedRow,
    BbvaProcessingResult,
    BbvaRowType,
    BbvaStatementHeader,
)
from statement_worker.extractors.bbva.validation import BbvaValidationReport

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
    signed_amount_column,
    source_file_column,
    validate_workbook_plan,
)

BBVA_WORKBOOK_SCHEMA_ID = "eecc.statement.bbva"
BBVA_WORKBOOK_SCHEMA_VERSION = 4
_FINANCIAL_FORMAT = "#,##0.00;[Red](#,##0.00);-"

# Lo que la hoja `Movimientos` dice de cada fila. El saldo anterior va como fila
# propia: es la primera línea de la tabla del documento.
_ROW_TYPE_LABELS = {
    BbvaRowType.OPENING_BALANCE: "SALDO_ANTERIOR",
    BbvaRowType.MOVEMENT: "MOVIMIENTO",
}

_SUMMARY_COLUMNS = (
    # La completa el trabajo al publicar: la estrategia nunca ve el nombre.
    source_file_column(),
    SpreadsheetColumn("account_type", "Tipo de cuenta", SpreadsheetCellType.TEXT, 16),
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
    SpreadsheetColumn("itf", "Total ITF", SpreadsheetCellType.DECIMAL, 14, _FINANCIAL_FORMAT),
    SpreadsheetColumn(
        "closing", "Saldo contable final", SpreadsheetCellType.DECIMAL, 18, _FINANCIAL_FORMAT
    ),
    SpreadsheetColumn("warnings", "Advertencias", SpreadsheetCellType.INTEGER, 14, "#,##0"),
)

_MOVEMENT_COLUMNS = (
    SpreadsheetColumn("page", "Página", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    SpreadsheetColumn("type", "Tipo de fila", SpreadsheetCellType.TEXT, 18),
    SpreadsheetColumn("posting_date", "Fecha oper.", SpreadsheetCellType.DATE, 14, "yyyy-mm-dd"),
    SpreadsheetColumn("value_date", "Fecha valor", SpreadsheetCellType.DATE, 14, "yyyy-mm-dd"),
    SpreadsheetColumn("description", "Descripción", SpreadsheetCellType.TEXT, 40),
    # Separadas de la descripción, como las imprime el documento.
    SpreadsheetColumn("office", "Oficina", SpreadsheetCellType.TEXT, 18),
    SpreadsheetColumn("channel", "Canal", SpreadsheetCellType.TEXT, 8),
    SpreadsheetColumn("operation", "N.º operación", SpreadsheetCellType.TEXT, 14),
    signed_amount_column(_FINANCIAL_FORMAT),
    # La misma cifra separada, como la publican los demás bancos. Sin el ITF.
    SpreadsheetColumn("debit", "Cargo", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("credit", "Abono", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("itf", "ITF", SpreadsheetCellType.DECIMAL, 12, _FINANCIAL_FORMAT),
    SpreadsheetColumn(
        "balance", "Saldo contable", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT
    ),
)


def _text(value: str) -> str | None:
    return sanitize_spreadsheet_text(value) if value else None


def _header_rows(header: BbvaStatementHeader) -> tuple[tuple[SpreadsheetCellValue, ...], ...]:
    return account_header_rows(
        (
            ("Banco", "BBVA"),
            ("Tipo de cuenta", header.account_product),
            ("Titular", header.holder),
            ("Dirección", header.address),
            ("Moneda", header.currency_label),
            ("RUC", header.tax_id),
            ("Ejecutivo de cuenta", header.account_manager),
            ("CCI", header.interbank_code),
            ("Oficina", header.office),
            (
                "Fecha del estado",
                header.statement_date.strftime("%d/%m/%Y") if header.statement_date else "",
            ),
            ("Código de cuenta", header.account_code),
            ("Hoja", header.sheets),
        )
    )


def _movement_cells(row: BbvaParsedRow) -> tuple[SpreadsheetCellValue, ...]:
    """Las celdas que salen del documento, sin la página ni el tipo."""

    return (
        row.posting_date,
        row.value_date,
        _text(row.description),
        _text(row.office),
        _text(row.channel),
        _text(row.operation_number),
        row.amount,
        row.itf,
        row.balance,
    )


def build_bbva_workbook_plan(
    result: BbvaProcessingResult,
    report: BbvaValidationReport,
) -> WorkbookPlan:
    if report.status is ExtractionStatus.FAILED:
        raise UnexportableStatementError("A failed statement extraction cannot be exported")

    document = result.document
    exported = tuple(row for row in document.rows if row.row_type in _ROW_TYPE_LABELS)

    movement_rows: tuple[tuple[SpreadsheetCellValue, ...], ...] = tuple(
        (
            row.page,
            _ROW_TYPE_LABELS[row.row_type],
            row.posting_date,
            row.value_date,
            _text(row.description),
            _text(row.office),
            _text(row.channel),
            _text(row.operation_number),
            row.amount,
            row.debit,
            row.credit,
            row.itf,
            row.balance,
        )
        for row in exported
    )

    summary_row: tuple[SpreadsheetCellValue, ...] = (
        None,
        result.header.account_type.value if result.header.account_type else None,
        document.currency,
        len(document.page_metrics),
        # El saldo anterior cuenta como una fila más de la hoja `Movimientos`.
        len(movement_rows),
        report.opening_balance,
        # Brutos, como suman las columnas `Abono` y `Cargo`; el ITF va en su total.
        report.total_credits,
        report.total_debits,
        report.total_itf,
        report.closing_balance,
        len(report.warning_codes),
    )

    cells_by_page = group_cells_by_page((row.page, _movement_cells(row)) for row in exported)
    page_rows = tuple(
        page_control_row(metric.page, metric.header_detected, cells_by_page)
        for metric in document.page_metrics
    )

    plan = WorkbookPlan(
        schema_id=BBVA_WORKBOOK_SCHEMA_ID,
        schema_version=BBVA_WORKBOOK_SCHEMA_VERSION,
        sheets=(
            SpreadsheetSheet("Resumen", "ResumenBbva", _SUMMARY_COLUMNS, (summary_row,)),
            SpreadsheetSheet(
                "Encabezado", "EncabezadoBbva", ACCOUNT_HEADER_COLUMNS, _header_rows(result.header)
            ),
            SpreadsheetSheet("Movimientos", "MovimientosBbva", _MOVEMENT_COLUMNS, movement_rows),
            SpreadsheetSheet(
                "Control_Paginas", "ControlPaginasBbva", PAGE_CONTROL_COLUMNS, page_rows
            ),
        ),
    )
    validate_workbook_plan(plan)
    return plan
