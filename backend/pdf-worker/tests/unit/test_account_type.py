"""Familia de la cuenta por producto, con el vocabulario propio de cada banco."""

from __future__ import annotations

from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.models import AccountType
from statement_worker.extractors.banco_nacion.header import read_banco_nacion_header
from statement_worker.extractors.banco_nacion.models import (
    BancoNacionStatementHeader,
    BancoNacionWord,
)
from statement_worker.extractors.interbank.header import read_interbank_header
from statement_worker.extractors.interbank.models import InterbankStatementHeader, InterbankWord
from statement_worker.parsing.account_type import classify_account_type


class AccountTypeTests(TestCase):
    def test_names_that_say_their_family(self) -> None:
        for product, expected in (
            ("CONTIAHORRO", AccountType.SAVINGS),
            ("Cuenta de Ahorros CLASICA", AccountType.SAVINGS),
            ("CUENTA CORRIENTE", AccountType.CHECKING),
            ("CTA CTE", AccountType.CHECKING),
        ):
            with self.subTest(product=product):
                self.assertIs(classify_account_type(product), expected)

    def test_a_bank_product_that_does_not_say_it(self) -> None:
        self.assertIs(
            classify_account_type("CUENTA SIMPLE SOLES", bank="interbank"), AccountType.SAVINGS
        )
        # El vocabulario es de su banco: en otro, el nombre solo no basta.
        self.assertIsNone(classify_account_type("CUENTA SIMPLE SOLES", bank="bbva"))
        self.assertIsNone(classify_account_type("CUENTA SIMPLE SOLES"))


class HeaderWithoutTitleTests(TestCase):
    """Sin su título, ninguna cabecera interpreta la primera línea como titular."""

    def test_banco_nacion(self) -> None:
        line = (BancoNacionWord("EMPRESA", Decimal("31"), Decimal("71"), Decimal("73")),)

        self.assertEqual(read_banco_nacion_header((line,)), BancoNacionStatementHeader())

    def test_interbank(self) -> None:
        line = (InterbankWord("TITULAR", Decimal("50"), Decimal("120"), Decimal("140")),)

        self.assertEqual(read_interbank_header((line,)), InterbankStatementHeader())
