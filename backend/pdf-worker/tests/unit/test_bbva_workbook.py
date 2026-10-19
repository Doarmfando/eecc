"""Contrato del Excel BBVA: lo que se ve en cada hoja y lo que ya no se publica."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest import TestCase

from statement_worker.domain.models import AccountType, Detection
from statement_worker.exporters.bbva_workbook import build_bbva_workbook_plan
from statement_worker.exporters.workbook import (
    SpreadsheetSheet,
    WorkbookPlan,
    with_source_file_name,
)
from statement_worker.extractors.bbva.models import (
    BbvaDocumentRows,
    BbvaPageMetrics,
    BbvaParsedRow,
    BbvaProcessingResult,
    BbvaRowType,
    BbvaStatementHeader,
)
from statement_worker.extractors.bbva.validation import validate_bbva_rows

_ROWS = (
    BbvaParsedRow(
        row_type=BbvaRowType.OPENING_BALANCE,
        page=1,
        description="SALDO ANTERIOR",
        balance=Decimal("100.00"),
    ),
    BbvaParsedRow(
        row_type=BbvaRowType.MOVEMENT,
        page=1,
        description="COMISION FICTICIA",
        posting_date=date(2026, 7, 1),
        value_date=date(2026, 7, 1),
        amount=Decimal("-10.00"),
        balance=Decimal("90.00"),
        office="BCA. INTERNET",
        channel="BIE",
        operation_number="0001",
    ),
    BbvaParsedRow(
        row_type=BbvaRowType.MOVEMENT,
        page=2,
        description="ABONO FICTICIO",
        posting_date=date(2026, 7, 2),
        value_date=date(2026, 7, 2),
        amount=Decimal("20.00"),
        itf=Decimal("0.05"),
        balance=Decimal("109.95"),
    ),
    BbvaParsedRow(
        row_type=BbvaRowType.DECLARED_ITF_TOTALS,
        page=2,
        label="CARGOS",
        itf=Decimal("0.05"),
    ),
)

_HEADER = BbvaStatementHeader(
    account_product="CONTIAHORRO",
    account_type=AccountType.SAVINGS,
    holder="=PERSONA FICTICIA",
    currency_label="SOLES",
    statement_date=date(2026, 7, 31),
    sheets="12-14",
)


def _plan(header: BbvaStatementHeader = _HEADER) -> WorkbookPlan:
    document = BbvaDocumentRows(
        rows=_ROWS,
        page_metrics=tuple(
            BbvaPageMetrics(page=page, word_count=99, row_count=40, header_detected=page < 3)
            for page in (1, 2, 3)
        ),
        currency="PEN",
    )
    result = BbvaProcessingResult(
        detection=Detection("bbva-account-v1", "0.3.0", Decimal("1")),
        document=document,
        header=header,
    )
    return build_bbva_workbook_plan(result, validate_bbva_rows(document.rows))


def _sheet(plan: WorkbookPlan, name: str) -> SpreadsheetSheet:
    return next(sheet for sheet in plan.sheets if sheet.name == name)


def _records(sheet: SpreadsheetSheet) -> list[dict[str, object]]:
    headers = [column.header for column in sheet.columns]
    return [dict(zip(headers, row, strict=True)) for row in sheet.rows]


class BbvaWorkbookTests(TestCase):
    def test_publishes_summary_header_movements_and_page_control_only(self) -> None:
        plan = _plan()

        self.assertEqual(
            [sheet.name for sheet in plan.sheets],
            ["Resumen", "Encabezado", "Movimientos", "Control_Paginas"],
        )
        self.assertEqual(plan.schema_version, 4)

    def test_the_summary_drops_the_technical_columns_and_names_the_file(self) -> None:
        summary = _sheet(plan := _plan(), "Resumen")
        headers = [column.header for column in summary.columns]

        for technical in ("Estado", "Extractor", "Versión", "Confianza"):
            with self.subTest(column=technical):
                self.assertNotIn(technical, headers)
        self.assertEqual(headers[:3], ["Archivo", "Tipo de cuenta", "Moneda"])

        record = _records(summary)[0]
        self.assertIsNone(record["Archivo"])
        self.assertEqual(record["Tipo de cuenta"], "AHORRO")
        self.assertEqual(record["Moneda"], "PEN")
        # El saldo anterior cuenta como una fila más de `Movimientos`.
        self.assertEqual(record["Movimientos"], 3)
        self.assertEqual(record["Saldo inicial"], Decimal("100.00"))

        stamped = _records(_sheet(with_source_file_name(plan, "Agosto ahorro.pdf"), "Resumen"))
        self.assertEqual(stamped[0]["Archivo"], "Agosto ahorro.pdf")

    def test_movements_start_with_the_opening_balance_and_say_what_each_row_is(self) -> None:
        movements = _sheet(_plan(), "Movimientos")
        records = _records(movements)

        headers = [column.header for column in movements.columns]
        self.assertEqual(headers[:2], ["Página", "Tipo de fila"])
        self.assertEqual(
            [record["Tipo de fila"] for record in records],
            ["SALDO_ANTERIOR", "MOVIMIENTO", "MOVIMIENTO"],
        )
        self.assertEqual(records[0]["Descripción"], "SALDO ANTERIOR")
        self.assertEqual(records[0]["Saldo contable"], Decimal("100.00"))
        self.assertIsNone(records[0]["Cargo/Abono"])
        # Los totales declarados de ITF no son filas de la tabla de movimientos.
        self.assertNotIn("CARGOS", [record["Descripción"] for record in records])

    def test_separates_charges_and_credits_and_totals_them_without_the_itf(self) -> None:
        plan = _plan()
        records = _records(_sheet(plan, "Movimientos"))

        self.assertEqual(
            [(r["Cargo/Abono"], r["Cargo"], r["Abono"], r["ITF"]) for r in records],
            [
                (None, None, None, None),
                (Decimal("-10.00"), Decimal("10.00"), None, None),
                (Decimal("20.00"), None, Decimal("20.00"), Decimal("0.05")),
            ],
        )
        summary = _records(_sheet(plan, "Resumen"))[0]
        # Como la referencia: cada total suma su propia columna y el ITF va aparte.
        self.assertEqual(summary["Total cargos"], Decimal("10.00"))
        self.assertEqual(summary["Total abonos"], Decimal("20.00"))
        self.assertEqual(summary["Total ITF"], Decimal("0.05"))
        self.assertEqual(
            summary["Saldo inicial"]
            + summary["Total abonos"]
            - summary["Total cargos"]
            - summary["Total ITF"],
            summary["Saldo contable final"],
        )

    def test_page_control_counts_rows_and_columns_read_from_each_page(self) -> None:
        control = _sheet(_plan(), "Control_Paginas")

        self.assertEqual(
            [column.header for column in control.columns],
            ["Página", "Filas extraídas", "Columnas extraídas", "Cabecera detectada"],
        )
        self.assertEqual(
            control.rows,
            (
                # Saldo anterior y un cargo con oficina, canal y operación, sin ITF:
                # ocho de las nueve columnas del documento.
                (1, 2, 8, True),
                # Un abono sin oficina, canal ni operación, con ITF.
                (2, 1, 6, True),
                # Una página sin filas lo dice, en vez de desaparecer del control.
                (3, 0, 0, False),
            ),
        )

    def test_the_header_lists_the_account_data_and_neutralises_formulas(self) -> None:
        records = {
            record["Campo"]: record["Valor"] for record in _records(_sheet(_plan(), "Encabezado"))
        }

        self.assertEqual(records["Banco"], "BBVA")
        self.assertEqual(records["Tipo de cuenta"], "CONTIAHORRO")
        self.assertEqual(records["Titular"], "'=PERSONA FICTICIA")
        self.assertEqual(records["Moneda"], "SOLES")
        self.assertEqual(records["Fecha del estado"], "31/07/2026")
        self.assertEqual(records["Hoja"], "12-14")
        # Lo que el documento no trae queda en blanco, sin relleno.
        self.assertIsNone(records["CCI"])
        self.assertEqual(
            list(records),
            [
                "Banco",
                "Tipo de cuenta",
                "Titular",
                "Dirección",
                "Moneda",
                "RUC",
                "Ejecutivo de cuenta",
                "CCI",
                "Oficina",
                "Fecha del estado",
                "Código de cuenta",
                "Hoja",
            ],
        )

    def test_an_unknown_account_family_is_left_blank(self) -> None:
        record = _records(_sheet(_plan(BbvaStatementHeader()), "Resumen"))[0]

        self.assertIsNone(record["Tipo de cuenta"])


class SourceFileNameStampTests(TestCase):
    def test_only_sheets_that_declare_the_column_are_touched(self) -> None:
        plan = _plan()

        stamped = with_source_file_name(plan, "=HYPERLINK(x).pdf")

        self.assertEqual(_records(_sheet(stamped, "Resumen"))[0]["Archivo"], "'=HYPERLINK(x).pdf")
        for name in ("Encabezado", "Movimientos", "Control_Paginas"):
            with self.subTest(sheet=name):
                self.assertEqual(_sheet(stamped, name), _sheet(plan, name))
        self.assertIs(with_source_file_name(plan, None), plan)

    def test_office_channel_and_operation_number_follow_the_description(self) -> None:
        movements = _sheet(_plan(), "Movimientos")
        headers = [column.header for column in movements.columns]

        self.assertEqual(
            headers[4:9],
            ["Descripción", "Oficina", "Canal", "N.º operación", "Cargo/Abono"],
        )
        records = _records(movements)
        self.assertEqual(
            (records[1]["Oficina"], records[1]["Canal"], records[1]["N.º operación"]),
            ("BCA. INTERNET", "BIE", "0001"),
        )
        # Vacías, no rellenas, cuando la fila no las trae.
        self.assertEqual(
            (records[2]["Oficina"], records[2]["Canal"], records[2]["N.º operación"]),
            (None, None, None),
        )
