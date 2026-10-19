"""Lectura de la cabecera BCP con la disposición medida en documentos reales.

Las posiciones son las del original; los textos, ficticios.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.models import AccountType
from statement_worker.extractors.bcp.header import read_bcp_header
from statement_worker.extractors.bcp.models import BcpStatementHeader, PdfWord


def _line(top: float, *pieces: tuple[float, str]) -> list[PdfWord]:
    """Palabras de una línea: cada pieza empieza en su `x0` y avanza seis puntos por letra."""

    words: list[PdfWord] = []
    for x0, text in pieces:
        x = Decimal(str(x0))
        for word in text.split():
            width = Decimal(len(word) * 6)
            words.append(PdfWord(text=word, x0=x, x1=x + width, top=Decimal(str(top))))
            x += width + Decimal("3")
    return words


def _header_words(
    *,
    title: str = "Estado de Cuenta de Ahorros CLASICA",
    currency: str = "SOLES",
    holder: str = "EMPRESA FICTICIA DE PRUEBA S.A.C.",
) -> tuple[PdfWord, ...]:
    return tuple(
        word
        for line in (
            _line(65, (28, title)),
            _line(86, (392, "PAGINA 1 DE 457")),
            # El titular comparte la línea con los rótulos de la cuenta.
            _line(98, (31, holder), (372, "CODIGO DE CUENTA"), (502, "MONEDA")),
            # El código va unos puntos antes que su rótulo.
            _line(115, (343, "191-00000000-0-00"), (488, currency)),
            _line(127, (31, "AV. FICTICIA 123 URB. DE PRUEBA")),
            _line(141, (31, "LIMA-LIMA")),
            _line(152, (409, "FECHA DE ESTADO DE CUENTA")),
            _line(155, (31, "LIMA-LIMA (000XX0)000")),
            _line(166, (361, "DEL 01/07/26 AL 31/07/26")),
            # Un correlativo de envío solo, que no es parte de la dirección.
            _line(169, (60, "1,234")),
            _line(209, (33, "FECHA PROC. FECHA VALOR"), (181, "DESCRIPCION"), (341, "CARGOS")),
            # Lo que venga después de la cabecera de la tabla no es cabecera de la cuenta.
            _line(230, (31, "SALDO ANTERIOR")),
        )
        for word in line
    )


class BcpHeaderTests(TestCase):
    def test_reads_each_field_by_its_label_or_shape(self) -> None:
        header = read_bcp_header(_header_words())

        self.assertEqual(header.account_product, "Cuenta de Ahorros CLASICA")
        self.assertIs(header.account_type, AccountType.SAVINGS)
        self.assertEqual(header.account_code, "191-00000000-0-00")
        self.assertEqual(header.currency_label, "SOLES")
        self.assertEqual(header.period, "DEL 01/07/26 AL 31/07/26")
        self.assertEqual(header.period_start, date(2026, 7, 1))
        self.assertEqual(header.period_end, date(2026, 7, 31))
        self.assertEqual((header.first_page, header.declared_pages), (1, 457))

    def test_the_holder_is_separated_from_the_labels_on_its_line(self) -> None:
        header = read_bcp_header(_header_words())

        self.assertEqual(header.holder, "EMPRESA FICTICIA DE PRUEBA S.A.C.")

    def test_the_address_joins_its_lines_and_skips_a_lone_number(self) -> None:
        header = read_bcp_header(_header_words())

        self.assertEqual(
            header.address, "AV. FICTICIA 123 URB. DE PRUEBA LIMA-LIMA LIMA-LIMA (000XX0)000"
        )

    def test_a_checking_account_in_dollars(self) -> None:
        header = read_bcp_header(
            _header_words(title="Estado de Cuenta Corriente", currency="DOLARES")
        )

        self.assertEqual(header.account_product, "Cuenta Corriente")
        self.assertIs(header.account_type, AccountType.CHECKING)
        self.assertEqual(header.currency_label, "DOLARES")

    def test_without_the_title_nothing_is_read(self) -> None:
        words = tuple(word for word in _header_words() if word.top != Decimal("65"))

        # Otra disposición: la primera línea no puede tomarse por el titular.
        self.assertEqual(read_bcp_header(words), BcpStatementHeader())

    def test_missing_fields_stay_empty(self) -> None:
        words = tuple(
            word
            for word in _header_words()
            if word.top not in (Decimal("115"), Decimal("166"), Decimal("86"))
        )

        header = read_bcp_header(words)

        self.assertEqual(header.holder, "EMPRESA FICTICIA DE PRUEBA S.A.C.")
        self.assertEqual((header.account_code, header.currency_label, header.period), ("", "", ""))
        self.assertIsNone(header.period_start)
        self.assertIsNone(header.declared_pages)
