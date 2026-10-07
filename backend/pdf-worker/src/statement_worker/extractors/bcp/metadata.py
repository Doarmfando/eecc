"""Metadata BCP derivada de texto efímero."""

from __future__ import annotations

import re

from statement_worker.parsing.dates import parse_statement_date
from statement_worker.parsing.text import normalized_upper


def extract_bcp_statement_year(first_page_text: str) -> int | None:
    text = normalized_upper(first_page_text)
    period = re.search(
        r"DEL\s+\d{1,2}/\d{1,2}/\d{2,4}\s+AL\s+(\d{1,2}/\d{1,2}/\d{2,4})",
        text,
    )
    if period:
        parsed = parse_statement_date(period.group(1))
        return parsed.year if parsed is not None else None

    explicit_date = re.search(r"\b(\d{1,2}/\d{1,2}/\d{2,4})\b", text)
    if explicit_date:
        parsed = parse_statement_date(explicit_date.group(1))
        return parsed.year if parsed is not None else None

    return None


# La cuenta y su moneda van juntas en la cabecera: `191-12345678-0-11 SOLES`.
_ACCOUNT_CURRENCY = re.compile(r"\b\d{3}-\d{8}-\d-\d{2}\s*-?\s*(SOLES|DOLARES)\b")
_DECLARED_CURRENCY = re.compile(r"\bMONEDA\s*:?\s*(SOLES|DOLARES)\b")
_CURRENCY_CODES = {"SOLES": "PEN", "DOLARES": "USD"}


def extract_bcp_currency(first_page_text: str) -> str | None:
    """La moneda de la cuenta; `None` si el documento no la declara.

    Solo se acepta junto al código de cuenta o tras `MONEDA`: «soles» suelto
    puede aparecer en la publicidad de la misma página.
    """

    text = normalized_upper(first_page_text)
    match = _ACCOUNT_CURRENCY.search(text) or _DECLARED_CURRENCY.search(text)
    return _CURRENCY_CODES[match.group(1)] if match else None
