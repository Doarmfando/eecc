from datetime import date
from unittest import TestCase

from statement_worker.parsing.dates import StatementPeriod, parse_statement_date


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


class StatementPeriodTests(TestCase):
    def test_a_late_december_movement_in_a_january_statement_is_from_the_year_before(
        self,
    ) -> None:
        # El caso reportado: el estado de cuenta de enero de 2026 trae un movimiento que
        # el banco procesó con fecha 31 de diciembre. No es del 31-12-2026.
        january = StatementPeriod(date(2026, 1, 1), date(2026, 1, 31))

        self.assertEqual(
            parse_statement_date("31DIC", default_year=2026, period=january), date(2025, 12, 31)
        )
        self.assertEqual(parse_statement_date("31/12", period=january), date(2025, 12, 31))
        self.assertEqual(parse_statement_date("15ENE", period=january), date(2026, 1, 15))

    def test_a_value_date_after_a_december_close_is_from_the_next_year(self) -> None:
        december = StatementPeriod(date(2025, 12, 1), date(2025, 12, 31))

        self.assertEqual(parse_statement_date("02ENE", period=december), date(2026, 1, 2))
        self.assertEqual(parse_statement_date("31DIC", period=december), date(2025, 12, 31))

    def test_a_period_across_new_year_keeps_each_month_in_its_year(self) -> None:
        period = StatementPeriod(date(2025, 12, 31), date(2026, 1, 31))

        self.assertEqual(period.place(12, 31), date(2025, 12, 31))
        self.assertEqual(period.place(1, 1), date(2026, 1, 1))

    def test_a_printed_year_wins_over_the_period(self) -> None:
        january = StatementPeriod(date(2026, 1, 1), date(2026, 1, 31))

        self.assertEqual(parse_statement_date("31/12/2026", period=january), date(2026, 12, 31))
        self.assertEqual(parse_statement_date("31DIC24", period=january), date(2024, 12, 31))

    def test_a_day_that_does_not_exist_near_the_period_is_rejected(self) -> None:
        # 2026 y sus vecinos no son bisiestos: el 29 de febrero no tiene año posible.
        february = StatementPeriod(date(2026, 2, 1), date(2026, 2, 28))

        self.assertIsNone(parse_statement_date("29FEB", period=february))
        self.assertIsNone(february.place(2, 30))
        self.assertEqual(
            StatementPeriod(date(2024, 2, 1), date(2024, 2, 29)).place(2, 29), date(2024, 2, 29)
        )
