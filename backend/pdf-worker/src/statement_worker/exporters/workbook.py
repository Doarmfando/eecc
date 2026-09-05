"""Contrato puro para workbooks de estados de cuenta."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum
from typing import TypeAlias

from statement_worker.domain.errors import InvalidWorkbookDataError

EXCEL_MAX_ROWS = 1_048_576
EXCEL_MAX_CELL_TEXT_LENGTH = 32_767

_FORMULA_PREFIXES = frozenset("=+-@")
_INVALID_SHEET_CHARACTERS = frozenset("[]:*?/\\")
_TABLE_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")
_INVALID_XML_CONTROLS = {
    codepoint: "\N{REPLACEMENT CHARACTER}"
    for codepoint in (*range(0x00, 0x09), 0x0B, 0x0C, *range(0x0E, 0x20))
}


class SpreadsheetCellType(StrEnum):
    TEXT = "TEXT"
    INTEGER = "INTEGER"
    DECIMAL = "DECIMAL"
    DATE = "DATE"
    BOOLEAN = "BOOLEAN"


SpreadsheetCellValue: TypeAlias = str | int | Decimal | date | bool | None


@dataclass(frozen=True, slots=True)
class SpreadsheetColumn:
    key: str
    header: str
    cell_type: SpreadsheetCellType
    width: int
    number_format: str | None = None

    def __post_init__(self) -> None:
        if not self.key or not self.header.strip():
            raise ValueError("column key and header are required")
        if not 5 <= self.width <= 80:
            raise ValueError("column width must be between 5 and 80")


@dataclass(frozen=True, slots=True)
class SpreadsheetSheet:
    name: str
    table_name: str
    columns: tuple[SpreadsheetColumn, ...]
    rows: tuple[tuple[SpreadsheetCellValue, ...], ...]


@dataclass(frozen=True, slots=True)
class WorkbookPlan:
    schema_id: str
    schema_version: int
    sheets: tuple[SpreadsheetSheet, ...]


def sanitize_spreadsheet_text(value: str) -> str:
    """Neutraliza fórmulas y caracteres XML inválidos sin ocultar contenido."""

    sanitized = value.translate(_INVALID_XML_CONTROLS)
    first_visible = sanitized.lstrip(" \t\r\n")[:1]
    if first_visible in _FORMULA_PREFIXES:
        return f"'{sanitized}"
    return sanitized


def _validate_cell(value: SpreadsheetCellValue, column: SpreadsheetColumn) -> None:
    if value is None:
        return

    valid = {
        SpreadsheetCellType.TEXT: isinstance(value, str),
        SpreadsheetCellType.INTEGER: isinstance(value, int) and not isinstance(value, bool),
        SpreadsheetCellType.DECIMAL: isinstance(value, Decimal),
        SpreadsheetCellType.DATE: isinstance(value, date),
        SpreadsheetCellType.BOOLEAN: isinstance(value, bool),
    }[column.cell_type]
    if not valid:
        raise InvalidWorkbookDataError("A workbook cell does not match its declared type")

    if isinstance(value, str):
        if len(value) > EXCEL_MAX_CELL_TEXT_LENGTH:
            raise InvalidWorkbookDataError("A workbook text cell exceeds the Excel limit")
        if value != sanitize_spreadsheet_text(value):
            raise InvalidWorkbookDataError("A workbook text cell is not safely neutralized")


def validate_workbook_plan(
    plan: WorkbookPlan,
    *,
    max_rows_per_sheet: int = EXCEL_MAX_ROWS,
) -> None:
    if not plan.schema_id.strip() or plan.schema_version < 1:
        raise InvalidWorkbookDataError("The workbook schema identifier is invalid")
    if not plan.sheets:
        raise InvalidWorkbookDataError("The workbook requires at least one sheet")
    if max_rows_per_sheet < 2 or max_rows_per_sheet > EXCEL_MAX_ROWS:
        raise ValueError("max_rows_per_sheet must be between 2 and the Excel limit")

    sheet_names: set[str] = set()
    table_names: set[str] = set()
    for sheet in plan.sheets:
        normalized_sheet_name = sheet.name.casefold()
        normalized_table_name = sheet.table_name.casefold()
        if (
            not sheet.name
            or len(sheet.name) > 31
            or any(character in _INVALID_SHEET_CHARACTERS for character in sheet.name)
            or normalized_sheet_name in sheet_names
        ):
            raise InvalidWorkbookDataError("A workbook sheet name is invalid or duplicated")
        if (
            len(sheet.table_name) > 255
            or not _TABLE_NAME_PATTERN.fullmatch(sheet.table_name)
            or normalized_table_name in table_names
        ):
            raise InvalidWorkbookDataError("A workbook table name is invalid or duplicated")
        if not sheet.columns:
            raise InvalidWorkbookDataError("A workbook sheet requires columns")
        if len(sheet.rows) + 1 > max_rows_per_sheet:
            raise InvalidWorkbookDataError("A workbook sheet exceeds the configured row limit")

        column_keys = [column.key.casefold() for column in sheet.columns]
        if len(column_keys) != len(set(column_keys)):
            raise InvalidWorkbookDataError("Workbook column keys must be unique per sheet")
        if any(
            len(column.header) > EXCEL_MAX_CELL_TEXT_LENGTH
            or column.header != sanitize_spreadsheet_text(column.header)
            for column in sheet.columns
        ):
            raise InvalidWorkbookDataError("A workbook column header is unsafe")

        for row in sheet.rows:
            if len(row) != len(sheet.columns):
                raise InvalidWorkbookDataError("A workbook row does not match its sheet columns")
            for value, column in zip(row, sheet.columns, strict=True):
                _validate_cell(value, column)

        sheet_names.add(normalized_sheet_name)
        table_names.add(normalized_table_name)
