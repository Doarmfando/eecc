"""Contrato XLSX del extractor genérico, separado del especializado por banco."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from statement_worker.domain.models import Detection, ExtractionStatus

from .workbook import (
    SpreadsheetCellType,
    SpreadsheetCellValue,
    SpreadsheetColumn,
    SpreadsheetSheet,
    WorkbookPlan,
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
GENERIC_WORKBOOK_SCHEMA_VERSION = 2
_FINANCIAL_FORMAT = "#,##0.00;[Red](#,##0.00);-"

_MOVEMENT_COLUMNS = (
    SpreadsheetColumn("page", "Página", SpreadsheetCellType.INTEGER, 10, "#,##0"),
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
    SpreadsheetColumn("rows", "Movimientos", SpreadsheetCellType.INTEGER, 14, "#,##0"),
    SpreadsheetColumn("verified", "Saldos verificados", SpreadsheetCellType.INTEGER, 20, "#,##0"),
    SpreadsheetColumn(
        "opening", "Saldo inicial", SpreadsheetCellType.DECIMAL, 16, _FINANCIAL_FORMAT
    ),
    SpreadsheetColumn("warnings", "Advertencias", SpreadsheetCellType.INTEGER, 14, "#,##0"),
)

_VALIDATION_COLUMNS = (
    SpreadsheetColumn("kind", "Tipo", SpreadsheetCellType.TEXT, 14),
    SpreadsheetColumn("code", "Código", SpreadsheetCellType.TEXT, 44),
    SpreadsheetColumn("status", "Estado", SpreadsheetCellType.TEXT, 16),
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
) -> WorkbookPlan:
    """El esquema declara que la lectura no proviene de una plantilla conocida."""

    movement_rows: tuple[tuple[SpreadsheetCellValue, ...], ...] = tuple(
        (
            row.page,
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

    summary_row: tuple[SpreadsheetCellValue, ...] = (
        None,
        len(rows),
        report.verified_transitions,
        _opening_balance(rows, report),
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
