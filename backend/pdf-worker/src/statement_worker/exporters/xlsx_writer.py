"""Adaptador openpyxl: único límite que conoce la librería XLSX."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.worksheet.worksheet import Worksheet

from statement_worker.domain.errors import ArtifactPublicationError
from statement_worker.services.atomic_artifact import publish_artifact_atomically

from .workbook import (
    SpreadsheetCellType,
    SpreadsheetCellValue,
    SpreadsheetSheet,
    WorkbookPlan,
    validate_workbook_plan,
)

XLSX_WRITER_ID = "openpyxl"
# Marca fija: el archivo no debe revelar cuándo ni dónde se procesó el documento.
_FIXED_TIMESTAMP = datetime(2000, 1, 1, 0, 0, 0)

_HEADER_FILL = PatternFill(fill_type="solid", start_color="FF17365D")
_HEADER_FONT = Font(bold=True, color="FFFFFFFF")
_HEADER_ALIGNMENT = Alignment(horizontal="center", vertical="center", wrap_text=True)
_TEXT_ALIGNMENT = Alignment(vertical="top", wrap_text=False)


def _table_style() -> TableStyleInfo:
    return TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)


def _apply_document_properties(workbook: Workbook, plan: WorkbookPlan) -> None:
    """Evita filtrar autor, ruta o marcas temporales del entorno de proceso."""

    properties = workbook.properties
    properties.creator = "eecc-pdf-worker"
    properties.lastModifiedBy = "eecc-pdf-worker"
    properties.title = f"{plan.schema_id} v{plan.schema_version}"
    properties.description = None
    properties.subject = None
    properties.keywords = None
    properties.category = None
    properties.identifier = None
    properties.created = _FIXED_TIMESTAMP
    # openpyxl reescribe `modified` al guardar; solo expone el instante de proceso.


def _write_sheet(workbook: Workbook, sheet: SpreadsheetSheet) -> None:
    worksheet: Worksheet = workbook.create_sheet(title=sheet.name)

    for column_index, column in enumerate(sheet.columns, start=1):
        header_cell = worksheet.cell(row=1, column=column_index, value=column.header)
        header_cell.data_type = "s"
        header_cell.font = _HEADER_FONT
        header_cell.fill = _HEADER_FILL
        header_cell.alignment = _HEADER_ALIGNMENT
        worksheet.column_dimensions[get_column_letter(column_index)].width = column.width

    for row_index, row in enumerate(sheet.rows, start=2):
        for column_index, (value, column) in enumerate(
            zip(row, sheet.columns, strict=True), start=1
        ):
            cell = worksheet.cell(row=row_index, column=column_index, value=value)
            if column.cell_type is SpreadsheetCellType.TEXT:
                # Ningún texto del documento puede convertirse en fórmula al escribirse.
                cell.data_type = "s"
                cell.alignment = _TEXT_ALIGNMENT
            if column.number_format is not None:
                cell.number_format = column.number_format

    worksheet.freeze_panes = "A2"
    reference = f"A1:{get_column_letter(len(sheet.columns))}{len(sheet.rows) + 1}"
    if sheet.rows:
        table = Table(displayName=sheet.table_name, ref=reference)
        table.tableStyleInfo = _table_style()
        worksheet.add_table(table)
    else:
        worksheet.auto_filter.ref = reference


def write_workbook_plan(plan: WorkbookPlan, path: Path) -> None:
    """Escribe el plan ya validado en un archivo XLSX cerrado."""

    validate_workbook_plan(plan)
    workbook = Workbook()
    try:
        default_sheet = workbook.active
        if default_sheet is not None:
            workbook.remove(default_sheet)
        _apply_document_properties(workbook, plan)
        for sheet in plan.sheets:
            _write_sheet(workbook, sheet)
        workbook.save(str(path))
    finally:
        workbook.close()


def _matches(
    actual: object, expected: SpreadsheetCellValue, cell_type: SpreadsheetCellType
) -> bool:
    if cell_type is SpreadsheetCellType.TEXT:
        # Excel no distingue entre celda vacía y cadena vacía al releer.
        if actual is None:
            return expected is None or expected == ""
        return isinstance(actual, str) and actual == expected
    if expected is None:
        return actual is None
    if cell_type is SpreadsheetCellType.BOOLEAN:
        return isinstance(actual, bool) and actual == expected
    if isinstance(actual, bool):
        return False
    if cell_type is SpreadsheetCellType.INTEGER:
        return isinstance(actual, int) and actual == expected
    if cell_type is SpreadsheetCellType.DATE:
        if isinstance(actual, datetime):
            return actual.date() == expected
        return isinstance(actual, date) and actual == expected
    if not isinstance(actual, int | float | Decimal):
        return False
    try:
        return Decimal(str(actual)) == expected
    except InvalidOperation:  # pragma: no cover - defensive against exotic readers.
        return False


def _verify_sheet(worksheet: Any, sheet: SpreadsheetSheet) -> None:
    expected_rows = len(sheet.rows) + 1
    if worksheet.max_row != expected_rows or worksheet.max_column != len(sheet.columns):
        raise ArtifactPublicationError("The published workbook has an unexpected sheet shape")

    read_rows = tuple(worksheet.iter_rows(values_only=True))
    header = read_rows[0]
    if tuple(header) != tuple(column.header for column in sheet.columns):
        raise ArtifactPublicationError("The published workbook has unexpected headers")

    for read_row, expected_row in zip(read_rows[1:], sheet.rows, strict=True):
        for actual, expected, column in zip(read_row, expected_row, sheet.columns, strict=True):
            if not _matches(actual, expected, column.cell_type):
                raise ArtifactPublicationError(
                    "The published workbook does not preserve a validated cell"
                )


def verify_workbook_file(plan: WorkbookPlan, path: Path) -> None:
    """Reabre el archivo y comprueba forma y valores, no bytes."""

    try:
        workbook = load_workbook(filename=str(path), read_only=True, data_only=True)
    except Exception as error:  # Cualquier fallo del lector invalida la salida.
        raise ArtifactPublicationError("The published workbook could not be reopened") from error

    try:
        if tuple(workbook.sheetnames) != tuple(sheet.name for sheet in plan.sheets):
            raise ArtifactPublicationError("The published workbook has unexpected sheets")
        for sheet in plan.sheets:
            _verify_sheet(workbook[sheet.name], sheet)
    finally:
        workbook.close()


def export_workbook_plan(
    plan: WorkbookPlan,
    target: Path,
    *,
    overwrite: bool = False,
) -> None:
    """Escribe, verifica y recién entonces publica el XLSX en su destino."""

    validate_workbook_plan(plan)
    publish_artifact_atomically(
        target,
        writer=lambda path: write_workbook_plan(plan, path),
        verifier=lambda path: verify_workbook_file(plan, path),
        overwrite=overwrite,
    )
