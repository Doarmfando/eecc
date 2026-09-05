from unittest import TestCase

from statement_worker.extractors.bcp.metadata import extract_bcp_statement_year


class BcpMetadataTests(TestCase):
    def test_prefers_period_end_year(self) -> None:
        self.assertEqual(
            extract_bcp_statement_year("DEL 31/12/25 AL 31/01/26"),
            2026,
        )

    def test_uses_first_explicit_date_as_fallback(self) -> None:
        self.assertEqual(extract_bcp_statement_year("FECHA 01/04/2026"), 2026)

    def test_returns_none_without_explicit_year(self) -> None:
        self.assertIsNone(extract_bcp_statement_year("PERIODO ABRIL"))
