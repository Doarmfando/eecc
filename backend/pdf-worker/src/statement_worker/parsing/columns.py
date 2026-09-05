"""Identificación del rol de cada columna a partir de su encabezado.

El extractor genérico no adivina qué significa un importe: lee el encabezado de la
tabla y solo trabaja con las columnas que puede nombrar. Si no reconoce el
encabezado, rechaza el documento en lugar de asignar cargos y abonos al azar.
"""

from __future__ import annotations

from enum import StrEnum

from .text import normalized_upper


class ColumnRole(StrEnum):
    POSTING_DATE = "POSTING_DATE"
    VALUE_DATE = "VALUE_DATE"
    DESCRIPTION = "DESCRIPTION"
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"
    BALANCE = "BALANCE"
    REFERENCE = "REFERENCE"


# Sinónimos observados en estados de cuenta en español. Cada entrada se compara
# como subcadena del encabezado normalizado, de más específica a más general.
_SYNONYMS: tuple[tuple[ColumnRole, tuple[str, ...]], ...] = (
    (
        ColumnRole.VALUE_DATE,
        ("FECHA VALOR", "F. VALOR", "FEC VALOR", "VALUTA"),
    ),
    (
        ColumnRole.POSTING_DATE,
        (
            "FECHA PROC",
            "FECHA DE PROCESO",
            "FECHA OPERACION",
            "FECHA DE OPERACION",
            "F. OPERACION",
            "FECHA MOVIMIENTO",
            "FECHA",
        ),
    ),
    (
        ColumnRole.DESCRIPTION,
        ("DESCRIPCION", "CONCEPTO", "DETALLE", "OPERACION", "GLOSA", "REFERENCIA DETALLE"),
    ),
    (
        ColumnRole.DEBIT,
        ("CARGO", "CARGOS", "DEBITO", "DEBITOS", "DEBE", "RETIRO", "RETIROS", "EGRESO"),
    ),
    (
        ColumnRole.CREDIT,
        ("ABONO", "ABONOS", "CREDITO", "CREDITOS", "HABER", "DEPOSITO", "DEPOSITOS", "INGRESO"),
    ),
    (
        ColumnRole.BALANCE,
        ("SALDO CONTABLE", "SALDO DISPONIBLE", "SALDO"),
    ),
    (
        ColumnRole.REFERENCE,
        ("NUM. OPERACION", "NRO OPERACION", "REFERENCIA", "DOCUMENTO", "OPER."),
    ),
)

# Un encabezado utilizable necesita fecha, descripción y al menos una columna de dinero.
_REQUIRED = (ColumnRole.POSTING_DATE, ColumnRole.DESCRIPTION)
_MONETARY = (ColumnRole.DEBIT, ColumnRole.CREDIT, ColumnRole.BALANCE)


def classify_header(value: str | None) -> ColumnRole | None:
    """Devuelve el rol del encabezado, o `None` si no se reconoce."""

    text = normalized_upper(value)
    if not text:
        return None
    for role, synonyms in _SYNONYMS:
        if any(synonym in text for synonym in synonyms):
            return role
    return None


def roles_present(value: str | None) -> frozenset[ColumnRole]:
    """Roles cuyos sinónimos aparecen en el texto.

    A diferencia de `classify_header`, no asume que el texto sea una sola celda:
    sirve para decidir si una página nombra las columnas de un estado de cuenta.
    """

    text = normalized_upper(value)
    if not text:
        return frozenset()
    return frozenset(
        role for role, synonyms in _SYNONYMS if any(synonym in text for synonym in synonyms)
    )


def map_header_row(cells: tuple[str | None, ...]) -> dict[ColumnRole, int]:
    """Asocia cada rol reconocido con su índice de columna.

    Ante encabezados repetidos conserva el primero: en los estados de cuenta la
    primera aparición es la de la tabla de movimientos.
    """

    mapping: dict[ColumnRole, int] = {}
    for index, cell in enumerate(cells):
        role = classify_header(cell)
        if role is not None and role not in mapping:
            mapping[role] = index
    return mapping


def is_usable_header(mapping: dict[ColumnRole, int]) -> bool:
    """Un encabezado sirve si nombra fecha, descripción y alguna columna de dinero."""

    if any(role not in mapping for role in _REQUIRED):
        return False
    return any(role in mapping for role in _MONETARY)
