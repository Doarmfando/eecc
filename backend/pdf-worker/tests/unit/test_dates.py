from datetime import date
from unittest import TestCase

from statement_worker.parsing.dates import parse_statement_date


class ParseStatementDateTests(TestCase):
    def test_parses_numeric_and_spanish_month_formats(self) -> None:
        cases = {
            "01/04/26": date(2026, 4, 1),
            "1-4-2026": date(2026, 4, 1),
            "31MAR": date(2026, 3, 31),
            "01 ABR 26": date(2026, 4, 1),
            "15SET2025": date(2025, 9, 15),
            "15SEP2025": date(2025, 9, 15),
            # Formatos de otros bancos: ISO inequívoco, mes en inglés y nombre completo.
            "2026-04-01": date(2026, 4, 1),
            "15/JAN/2025": date(2025, 1, 15),
            "3 DE MARZO DE 2025": date(2025, 3, 3),
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(parse_statement_date(raw, default_year=2026), expected)

    def test_uses_default_year_only_when_missing(self) -> None:
        self.assertEqual(parse_statement_date("31DIC", default_year=2025), date(2025, 12, 31))
        self.assertIsNone(parse_statement_date("31DIC"))

    def test_rejects_invalid_dates(self) -> None:
        for raw in (None, "", "31/02/2026", "01XYZ2026", "2026-13-01", "01/01/1899"):
            with self.subTest(raw=raw):
                self.assertIsNone(parse_statement_date(raw, default_year=2026))
