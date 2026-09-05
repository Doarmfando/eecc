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
