"""La deducción de columnas se demuestra con la aritmética, no con vocabulario."""

from unittest import TestCase

from statement_worker.extractors.generic.inference import (
    MINIMUM_INFERRED_TRANSITIONS,
    infer_columns,
    select_movement_rows,
)
from statement_worker.parsing.columns import ColumnRole

# Encabezados deliberadamente incomprensibles: el contenido debe bastar.
_HEADER = ("DT", "NARRATIVE", "WITHDRAWAL", "LODGEMENT", "BAL")

_MOVEMENTS = (
    ("01/06/2026", "TRANSFERENCIA", "", "1500.00", "3500.00"),
    ("02/06/2026", "PAGO SERVICIO", "230.50", "", "3269.50"),
    ("03/06/2026", "COMPRA TARJETA", "119.90", "", "3149.60"),
    ("05/06/2026", "INTERESES", "", "12.40", "3162.00"),
    ("07/06/2026", "RETIRO CAJERO", "200.00", "", "2962.00"),
    ("09/06/2026", "DEPOSITO", "", "800.00", "3762.00"),
)


def _table(*extra: tuple[str, ...]) -> tuple[tuple[str | None, ...], ...]:
    return tuple(
        [
            ("BANCO DESCONOCIDO", "", "", "", ""),
            _HEADER,
            *_MOVEMENTS,
            *extra,
        ]
    )


class ColumnInferenceTests(TestCase):
    def test_deduces_every_role_without_recognising_a_single_header(self) -> None:
        inferred = infer_columns(_table())

        self.assertIsNotNone(inferred)
        assert inferred is not None
        self.assertEqual(inferred.mapping[ColumnRole.POSTING_DATE], 0)
        self.assertEqual(inferred.mapping[ColumnRole.DESCRIPTION], 1)
        self.assertEqual(inferred.mapping[ColumnRole.DEBIT], 2)
        self.assertEqual(inferred.mapping[ColumnRole.CREDIT], 3)
        self.assertEqual(inferred.mapping[ColumnRole.BALANCE], 4)
        self.assertGreaterEqual(inferred.verified_transitions, MINIMUM_INFERRED_TRANSITIONS)

    def test_the_titles_of_the_document_do_not_distort_the_profile(self) -> None:
        selected = select_movement_rows(_table(("PAGINA 1 DE 1", "", "", "", "")))

        self.assertEqual(len(selected), len(_MOVEMENTS))

    def test_refuses_when_the_arithmetic_does_not_close(self) -> None:
        broken = list(_MOVEMENTS)
        broken[3] = ("05/06/2026", "INTERESES", "", "12.40", "9999.99")
        table = tuple([("BANCO DESCONOCIDO", "", "", "", ""), _HEADER, *broken])

        self.assertIsNone(infer_columns(table))

    def test_refuses_a_table_with_too_few_movements(self) -> None:
        table = tuple([_HEADER, *_MOVEMENTS[:2]])

        self.assertIsNone(infer_columns(table))

    def test_reads_a_single_signed_amount_column(self) -> None:
        rows = (
            ("DT", "NARRATIVE", "AMT", "BAL"),
            ("01/06/2026", "TRANSFERENCIA", "1500.00", "3500.00"),
            ("02/06/2026", "PAGO SERVICIO", "-230.50", "3269.50"),
            ("03/06/2026", "COMPRA TARJETA", "-119.90", "3149.60"),
            ("05/06/2026", "INTERESES", "12.40", "3162.00"),
            ("07/06/2026", "RETIRO CAJERO", "-200.00", "2962.00"),
            ("09/06/2026", "DEPOSITO", "800.00", "3762.00"),
        )

        inferred = infer_columns(rows)

        self.assertIsNotNone(inferred)
        assert inferred is not None
        self.assertEqual(inferred.mapping[ColumnRole.CREDIT], 2)
        self.assertNotIn(ColumnRole.DEBIT, inferred.mapping)
        self.assertEqual(inferred.mapping[ColumnRole.BALANCE], 3)

    def test_refuses_a_table_without_a_description_column(self) -> None:
        rows = tuple(
            [("DT", "WITHDRAWAL", "LODGEMENT", "BAL")]
            + [(fecha, retiro, deposito, saldo) for fecha, _, retiro, deposito, saldo in _MOVEMENTS]
        )

        self.assertIsNone(infer_columns(rows))

    def test_refuses_when_two_readings_would_both_close(self) -> None:
        # Cargos y abonos en cero: cualquier asignación cuadraría, así que no se decide.
        rows = tuple(
            [("DT", "NARRATIVE", "A", "B", "BAL")]
            + [
                (f"0{index + 1}/06/2026", "OPERACION", "0.00", "0.00", "1000.00")
                for index in range(6)
            ]
        )

        self.assertIsNone(infer_columns(rows))
