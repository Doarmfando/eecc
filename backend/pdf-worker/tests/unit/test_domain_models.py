from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.models import (
    Detection,
    ExtractionWarning,
    Movement,
    Period,
    WarningSeverity,
)


class DomainModelTests(TestCase):
    def test_rejects_invalid_confidence(self) -> None:
        with self.assertRaises(ValueError):
            Detection("extractor", "1.0.0", Decimal("1.01"))

    def test_rejects_negative_debit(self) -> None:
        with self.assertRaises(ValueError):
            Movement(description="OPERACION SINTETICA", page=1, debit=Decimal("-1.00"))

    def test_rejects_invalid_period_month(self) -> None:
        with self.assertRaises(ValueError):
            Period(year=2026, month=13)

    def test_rejects_invalid_period_year(self) -> None:
        with self.assertRaises(ValueError):
            Period(year=1899, month=1)

    def test_rejects_empty_description_and_invalid_page(self) -> None:
        with self.assertRaises(ValueError):
            Movement(description=" ", page=1)
        with self.assertRaises(ValueError):
            Movement(description="OPERACION SINTETICA", page=0)

    def test_rejects_negative_credit_and_two_sided_movement(self) -> None:
        with self.assertRaises(ValueError):
            Movement(description="OPERACION SINTETICA", page=1, credit=Decimal("-1.00"))
        with self.assertRaises(ValueError):
            Movement(
                description="OPERACION SINTETICA",
                page=1,
                debit=Decimal("1.00"),
                credit=Decimal("1.00"),
            )

    def test_rejects_invalid_warning_page(self) -> None:
        with self.assertRaises(ValueError):
            ExtractionWarning(code="SYNTHETIC", severity=WarningSeverity.WARNING, page=0)
