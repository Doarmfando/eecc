from unittest import TestCase

from statement_worker.extractors.bcp.metadata import (
    extract_bcp_currency,
    extract_bcp_statement_year,
)


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


class BcpCurrencyTests(TestCase):
    def test_reads_the_currency_printed_next_to_the_account(self) -> None:
        self.assertEqual(extract_bcp_currency("CUENTA 191-12345678-0-11 SOLES"), "PEN")
        self.assertEqual(extract_bcp_currency("191-12345678-1-90 DOLARES"), "USD")

    def test_accepts_the_dash_and_accents_of_the_header(self) -> None:
        self.assertEqual(extract_bcp_currency("CUENTA 000-00000000-0-00 - Dólares"), "USD")

    def test_reads_a_declared_currency_label(self) -> None:
        self.assertEqual(extract_bcp_currency("MONEDA: SOLES"), "PEN")

    def test_ignores_currency_words_away_from_the_account(self) -> None:
        # «Soles» suelto puede venir de la publicidad de la página; no declara nada.
        self.assertIsNone(extract_bcp_currency("AHORRA EN SOLES CON NOSOTROS"))
        self.assertIsNone(extract_bcp_currency(""))
