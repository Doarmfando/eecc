"""Adaptador CSV del mismo plan validado que alimenta al XLSX."""

from __future__ import annotations

import csv
import re
from datetime import date
from decimal import Decimal
from functools import partial
from pathlib import Path

from statement_worker.domain.errors import (
    ArtifactPublicationError,
    InvalidWorkbookDataError,
)
from statement_worker.services.atomic_artifact import (
    ArtifactPlan,
    publish_artifacts_atomically,
)

from .workbook import (
    SpreadsheetCellType,
    SpreadsheetCellValue,
    SpreadsheetSheet,
    WorkbookPlan,
    validate_workbook_plan,
)

CSV_ENCODING = "utf-8-sig"
CSV_DELIMITER = ","
CSV_LINE_TERMINATOR = "\r\n"

_STEM_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_UNSAFE_NAME_CHARACTERS = re.compile(r"[^A-Za-z0-9_-]+")


def _safe_sheet_token(name: str) -> str:
    token = _UNSAFE_NAME_CHARACTERS.sub("_", name).strip("_")
    if not token:
        raise InvalidWorkbookDataError("A sheet name cannot become a safe file name")
    return token


def csv_file_name(stem: str, sheet_name: str) -> str:
    """Deriva un nombre de archivo sin rutas ni caracteres del documento original."""

    if not _STEM_PATTERN.fullmatch(stem):
        raise InvalidWorkbookDataError("The CSV file stem is not a safe identifier")
    return f"{stem}_{_safe_sheet_token(sheet_name)}.csv"


def render_csv_value(value: SpreadsheetCellValue, cell_type: SpreadsheetCellType) -> str:
    """Convierte al borde textual sin reinterpretar el valor ya validado."""

    if value is None:
        return ""
    if cell_type is SpreadsheetCellType.BOOLEAN:
        return "true" if value else "false"
    if cell_type is SpreadsheetCellType.DATE and isinstance(value, date):
        return value.isoformat()
    if cell_type is SpreadsheetCellType.DECIMAL and isinstance(value, Decimal):
        return format(value, "f")
    return str(value)


def _expected_records(sheet: SpreadsheetSheet) -> tuple[tuple[str, ...], ...]:
    header = tuple(column.header for column in sheet.columns)
    body = tuple(
        tuple(
            render_csv_value(value, column.cell_type)
            for value, column in zip(row, sheet.columns, strict=True)
        )
        for row in sheet.rows
    )
    return (header, *body)


def write_sheet_csv(sheet: SpreadsheetSheet, path: Path) -> None:
    """Escribe una hoja del plan como CSV cerrado."""

    with path.open("w", encoding=CSV_ENCODING, newline="") as handle:
        writer = csv.writer(
            handle,
            delimiter=CSV_DELIMITER,
            lineterminator=CSV_LINE_TERMINATOR,
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writerows(_expected_records(sheet))


def verify_sheet_csv(sheet: SpreadsheetSheet, path: Path) -> None:
    """Relee el archivo y compara cada campo con el plan, no bytes."""

    try:
        with path.open("r", encoding=CSV_ENCODING, newline="") as handle:
            records = tuple(tuple(record) for record in csv.reader(handle, delimiter=CSV_DELIMITER))
    except (OSError, UnicodeDecodeError, csv.Error) as error:
        raise ArtifactPublicationError("The published CSV could not be reopened") from error

    expected = _expected_records(sheet)
    if len(records) != len(expected):
        raise ArtifactPublicationError("The published CSV has an unexpected row count")
    for record, expected_record in zip(records, expected, strict=True):
        if record != expected_record:
            raise ArtifactPublicationError("The published CSV does not preserve a validated row")


def export_csv_bundle(
    plan: WorkbookPlan,
    directory: Path,
    *,
    stem: str,
    overwrite: bool = False,
) -> tuple[Path, ...]:
    """Publica un CSV por hoja o no deja ninguno publicado por esta llamada."""

    validate_workbook_plan(plan)
    if not directory.is_dir():
        raise ArtifactPublicationError("The CSV target directory does not exist")

    artifacts = tuple(
        ArtifactPlan(
            target=directory / csv_file_name(stem, sheet.name),
            writer=partial(write_sheet_csv, sheet),
            verifier=partial(verify_sheet_csv, sheet),
        )
        for sheet in plan.sheets
    )
    publish_artifacts_atomically(artifacts, overwrite=overwrite)
    return tuple(artifact.target for artifact in artifacts)
