from decimal import Decimal
from unittest import TestCase

from statement_worker.parsing.amounts import parse_amount


class ParseAmountTests(TestCase):
    def test_parses_supported_decimal_formats(self) -> None:
        cases = {
            "422,546.01": Decimal("422546.01"),
            "422.546,01": Decimal("422546.01"),
            "120.00": Decimal("120.00"),
            "120,00": Decimal("120.00"),
            "S/ 1,250.75": Decimal("1250.75"),
            "US$ 1.250,75": Decimal("1250.75"),
            "(1,250.75)": Decimal("-1250.75"),
            "-120.00": Decimal("-120.00"),
            "1,234,567": Decimal("1234567"),
            "1250": Decimal("1250"),
            # Signo al final y monedas de otros países.
            "120.00-": Decimal("-120.00"),
            "1.234,56 EUR": Decimal("1234.56"),
            "R$ 2.500,00": Decimal("2500.00"),
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(parse_amount(raw), expected)

    def test_rejects_empty_invalid_and_ambiguous_values(self) -> None:
        for raw in (
            None,
            "",
            "importe",
            "1,2",
            "12.3456",
            "(120.00",
            "(-120.00)",
            "1-2",
            "1.234.5",
            "1,234.567",
        ):
            with self.subTest(raw=raw):
                self.assertIsNone(parse_amount(raw))

    def test_never_returns_float(self) -> None:
        self.assertIsInstance(parse_amount("10.00"), Decimal)
