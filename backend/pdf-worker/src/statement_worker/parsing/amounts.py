"""Parsing conservador de importes financieros."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from .text import normalize_spaces

# Símbolos y códigos de moneda que pueden acompañar al importe en distintos bancos.
_CURRENCY_RE = re.compile(
    r"(?i)(?:S/\.?|R\$|US\$|USD|PEN|EUR|GBP|MXN|COP|CLP|ARS|BRL|BOB|UYU|PYG|[$€£])"
)
_VALID_NUMBER_RE = re.compile(r"^[0-9.,]+$")
NON_BREAKING_SPACE = chr(0xA0)


def _normalize_separators(raw: str) -> str | None:
    last_dot = raw.rfind(".")
    last_comma = raw.rfind(",")

    if last_dot >= 0 and last_comma >= 0:
        decimal_separator = "." if last_dot > last_comma else ","
        thousands_separator = "," if decimal_separator == "." else "."
        integer_part, decimal_part = raw.rsplit(decimal_separator, maxsplit=1)
        if len(decimal_part) != 2:
            return None
        integer_part = integer_part.replace(thousands_separator, "")
        if decimal_separator in integer_part:
            return None
        return f"{integer_part}.{decimal_part}"

    separator = "." if last_dot >= 0 else "," if last_comma >= 0 else None
    if separator is None:
        return raw

    groups = raw.split(separator)
    if any(not group for group in groups):
        return None

    if len(groups[-1]) == 2:
        integer_part = "".join(groups[:-1])
        return f"{integer_part}.{groups[-1]}"

    if len(groups) > 1 and all(len(group) == 3 for group in groups[1:]):
        return "".join(groups)

    return None


def parse_amount(value: str | None) -> Decimal | None:
    """Convierte un importe inequívoco a ``Decimal``.

    Devuelve ``None`` para valores vacíos, inválidos o ambiguos. Los paréntesis
    y el signo menos representan valores negativos. No redondea ni convierte a
    ``float``.
    """

    raw = normalize_spaces(value)
    if not raw:
        return None

    stripped = raw.strip()
    parenthesized = stripped.startswith("(") and stripped.endswith(")")
    if (stripped.startswith("(") or stripped.endswith(")")) and not parenthesized:
        return None

    unsigned = stripped[1:-1] if parenthesized else stripped
    unsigned = _CURRENCY_RE.sub("", unsigned)
    # El espacio duro aparece como separador de miles en varios bancos.
    unsigned = unsigned.replace(NON_BREAKING_SPACE, " ").strip()

    # Varios bancos escriben el signo al final: `230.50-`.
    trailing_negative = unsigned.endswith("-")
    if unsigned.endswith(("-", "+")):
        unsigned = unsigned[:-1].strip()

    unsigned = unsigned.replace(" ", "")

    signed_negative = unsigned.startswith("-") or trailing_negative
    if unsigned.startswith(("+", "-")):
        unsigned = unsigned[1:]
    if "+" in unsigned or "-" in unsigned:
        return None
    if parenthesized and signed_negative:
        return None
    negative = parenthesized or signed_negative

    if not unsigned or not _VALID_NUMBER_RE.fullmatch(unsigned):
        return None

    normalized = _normalize_separators(unsigned)
    if normalized is None:
        return None

    try:
        amount = Decimal(normalized)
    except InvalidOperation:
        return None

    return -amount if negative and amount != 0 else amount
