"""Contrato XLSX del extractor genérico, separado del especializado por banco.

Comparte con los bancos conocidos `Tipo de fila` y `Control_Paginas` (ADR-0015).
No publica `Encabezado` ni tipo de cuenta: sin plantilla, no sabe dónde leerlos.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from statement_worker.domain.models import Detection, ExtractionStatus

from .workbook import (
    PAGE_CONTROL_COLUMNS,
    SpreadsheetCellType,
    SpreadsheetCellValue,
    SpreadsheetColumn,
    SpreadsheetSheet,
    WorkbookPlan,
    group_cells_by_page,
    page_control_row,
    sanitize_spreadsheet_text,
    signed_amount,
    signed_amount_column,
    source_file_column,
    validate_workbook_plan,
)

if TYPE_CHECKING:
    from statement_worker.extractors.generic.rows import GenericParsedRow
    from statement_worker.extractors.generic.validation import GenericValidationReport

GENERIC_WORKBOOK_SCHEMA_ID = "eecc.statement.generic"
GENERIC_WORKBOOK_SCHEMA_VERSION = 3
_FINANCIAL_FORMAT = "#,##0.00;[Red](#,##0.00);-"

_MOVEMENT_COLUMNS = (
    SpreadsheetColumn("page", "Página", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    # Todas sus filas son movimientos: el respaldo no lee saldos ni totales declarados.
    SpreadsheetColumn("type", "Tipo de fila", SpreadsheetCellType.TEXT, 14),
    SpreadsheetColumn("posting_date", "Fecha", SpreadsheetCellType.DATE, 15, "yyyy-mm-dd"),
    SpreadsheetColumn("value_date", "Fecha valor", SpreadsheetCellType.DATE, 15, "yyyy-mm-dd"),
    SpreadsheetColumn("description", "Descripción", SpreadsheetCellType.TEXT, 48),
    SpreadsheetColumn("reference", "Referencia", SpreadsheetCellType.TEXT, 22),
    signed_amount_column(_FINANCIAL_FORMAT),
    SpreadsheetColumn("debit", "Cargo", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("credit", "Abono", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
    SpreadsheetColumn("balance", "Saldo", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT),
)

_SUMMARY_COLUMNS = (
    source_file_column(),
    SpreadsheetColumn("pages", "Páginas", SpreadsheetCellType.INTEGER, 10, "#,##0"),
    SpreadsheetColumn("rows", "Movimientos", SpreadsheetCellType.INTEGER, 14, "#,##0"),
    SpreadsheetColumn("verified", "Saldos verificados", SpreadsheetCellType.INTEGER, 20, "#,##0"),
    SpreadsheetColumn(
        "opening", "Saldo inicial", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT
    ),
    SpreadsheetColumn("warnings", "Advertencias", SpreadsheetCellType.INTEGER, 14, "#,##0"),
)


def _opening_balance(
    rows: tuple[GenericParsedRow, ...], report: GenericValidationReport
) -> Decimal | None:
    """Saldo antes de la primera fila, solo cuando los saldos están demostrados.

    El respaldo no lee un saldo inicial declarado. Se deduce de la primera fila
    —su saldo menos lo que movió— únicamente si la validación comprobó que los
    saldos avanzan con los importes; si no, la celda queda en blanco.
    """

    if report.status is not ExtractionStatus.SUCCEEDED or not rows:
        return None
    first = rows[0]
    if first.balance is None:
        return None
    return first.balance - (first.credit or Decimal("0")) + (first.debit or Decimal("0"))


def build_generic_workbook_plan(
    detection: Detection,
    rows: tuple[GenericParsedRow, ...],
    report: GenericValidationReport,
    *,
    pages: tuple[int, ...] = (),
) -> WorkbookPlan:
    """El esquema declara que la lectura no proviene de una plantilla conocida.

    `pages` son las páginas del documento; sin ellas, las que traen filas.
    """

    movement_rows: tuple[tuple[SpreadsheetCellValue, ...], ...] = tuple(
        (
            row.page,
            "MOVIMIENTO",
            row.posting_date,
            row.value_date,
            sanitize_spreadsheet_text(row.description),
            sanitize_spreadsheet_text(row.reference or ""),
            signed_amount(row.debit, row.credit),
            row.debit,
            row.credit,
            row.balance,
        )
        for row in rows
    )

    page_numbers = pages or tuple(sorted({row.page for row in rows}))
    summary_row: tuple[SpreadsheetCellValue, ...] = (
        None,
        len(page_numbers),
        len(rows),
        report.verified_transitions,
        _opening_balance(rows, report),
        len(report.warning_codes),
    )

    # Lo leído de cada página; `Cargo/Abono` se deriva y no cuenta como columna extraída.
    # Si encontró la cabecera lo sabe el documento entero, no cada página: queda vacío.
    cells_by_page = group_cells_by_page(
        (
            row.page,
            (
                row.posting_date,
                row.value_date,
                row.description or None,
                row.reference or None,
                row.debit,
                row.credit,
                row.balance,
            ),
        )
        for row in rows
    )
    page_rows = tuple(page_control_row(page, None, cells_by_page) for page in page_numbers)

    plan = WorkbookPlan(
        schema_id=GENERIC_WORKBOOK_SCHEMA_ID,
        schema_version=GENERIC_WORKBOOK_SCHEMA_VERSION,
        sheets=(
            SpreadsheetSheet("Resumen", "ResumenGenerico", _SUMMARY_COLUMNS, (summary_row,)),
            SpreadsheetSheet(
                "Movimientos", "MovimientosGenerico", _MOVEMENT_COLUMNS, movement_rows
            ),
            SpreadsheetSheet(
                "Control_Paginas", "ControlPaginasGenerico", PAGE_CONTROL_COLUMNS, page_rows
            ),
        ),
    )
    validate_workbook_plan(plan)
    return plan
