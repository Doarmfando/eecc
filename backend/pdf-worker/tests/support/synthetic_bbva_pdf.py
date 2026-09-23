"""Estado de cuenta sintético con la plantilla BBVA, confirmada con un documento real.

Reproduce lo que distingue a esta plantilla: cabecera repartida en tres líneas,
`CARGO/ABONO` en una sola columna con signo, `ITF` en columna propia que descuenta
del saldo, fechas `dd-mm` sin año, `SALDO ANTERIOR` como apertura, sin fila de
saldo final —el cierre es el saldo de la última fila— y el bloque `TOTALES POR
ITF` al final. Todos los nombres, cuentas e importes son ficticios.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas

# (día, mes, descripción, importe con signo, itf). El ITF es `None` cuando la
# operación no lo paga, que es lo que hace el documento real en la mitad de sus filas.
_MOVEMENTS: tuple[tuple[int, int, str, str, str | None], ...] = (
    (1, 7, "PAGO FACT BCA. INTERNET", "-1,200.00", "0.05"),
    (1, 7, "INMOB E INV FICTICIA", "-450.25", "0.02"),
    (1, 7, "COMISION TRANSFERENCIAS", "-15.50", None),
    (2, 7, "INGRESO EN EFECTIVO", "+3,000.00", "0.15"),
    (2, 7, "REPUESTOS FICTICIOS SAC", "-820.00", None),
    (3, 7, "PAGO FACT PROVEEDOR", "-1,050.75", "0.05"),
    (5, 7, "MANTENIMIENTO DE CUENTA", "-30.00", None),
    (6, 7, "INGRESO EN EFECTIVO", "+1,480.00", "0.07"),
)
_OPENING = Decimal("685126.55")
_ISSUE_DATE = "31-07-2026"
_ROWS_PER_PAGE = 5

_X_DATE = 40
_X_VALUE_DATE = 78
_X_DESCRIPTION = 116
_X_OPERATION = 352
_X_AMOUNT = 416  # borde derecho de cada columna de importes
_X_ITF = 467
_X_BALANCE = 533


def _parse(text: str) -> Decimal:
    return Decimal(text.replace(",", ""))


def _format(amount: Decimal) -> str:
    return f"{amount:,.2f}"


def _header(canvas: Canvas, top: float) -> None:
    """Las tres líneas de la cabecera, como las imprime el banco."""

    canvas.setFont("Helvetica-Bold", 7)
    canvas.drawString(48, top, "FECHA")
    canvas.drawString(86, top, "FECHA")
    canvas.drawString(523, top, "SALDO")
    canvas.drawString(166, top - 3, "DESCRIPCION")
    canvas.drawString(275, top - 3, "OFICINA")
    canvas.drawString(324, top - 3, "CAN")
    canvas.drawString(356, top - 3, "N OPER.")
    canvas.drawString(405, top - 3, "CARGO/ABONO")
    canvas.drawString(477, top - 3, "ITF")
    canvas.drawString(40, top - 7, "OPER.")
    canvas.drawString(78, top - 7, "VALOR")
    canvas.drawString(508, top - 7, "CONTABLE")


def create_synthetic_bbva_pdf(
    output_path: Path,
    *,
    broken_balance: bool = False,
    include_itf_totals: bool = True,
    include_issue_date: bool = True,
    wrong_itf_totals: bool = False,
) -> Decimal:
    """Genera el documento y devuelve el saldo contable final.

    `broken_balance` altera un saldo intermedio; `include_itf_totals=False` deja el
    documento sin el bloque de cierre; `include_issue_date=False` quita la fecha del
    pie, que es de donde sale el año; `wrong_itf_totals` declara un total de ITF que
    no cuadra con la columna.
    """

    output_path.parent.mkdir(parents=True, exist_ok=True)
    _width, height = A4
    canvas = Canvas(str(output_path), pagesize=A4, invariant=1)
    canvas.setTitle("Synthetic BBVA-like statement")

    balances: list[Decimal] = []
    running = _OPENING
    for *_rest, amount, itf in _MOVEMENTS:
        running += _parse(amount) - (_parse(itf) if itf else Decimal("0"))
        balances.append(running)
    if broken_balance:
        balances[2] += Decimal("1.00")

    total_itf = sum((_parse(m[4]) for m in _MOVEMENTS if m[4]), Decimal("0"))

    chunks = [
        _MOVEMENTS[index : index + _ROWS_PER_PAGE]
        for index in range(0, len(_MOVEMENTS), _ROWS_PER_PAGE)
    ]
    written = 0
    for page_index, chunk in enumerate(chunks):
        top = height - 60
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(_X_DATE, top, "MOVIMIENTO Y SALDO A LA FECHA")
        top -= 10
        canvas.setFont("Helvetica", 7)
        canvas.drawString(_X_DATE, top, "CUENTA CORRIENTE")
        top -= 10
        canvas.drawString(_X_DATE, top, "TITULARES: EMPRESA FICTICIA SAC")
        top -= 10
        canvas.drawString(_X_DATE, top, "MONEDA: DOLARES US")
        top -= 20

        _header(canvas, top)
        top -= 18

        canvas.setFont("Helvetica", 7)
        if page_index == 0:
            canvas.drawString(127, top, "SALDO ANTERIOR")
            canvas.drawRightString(_X_BALANCE, top, _format(_OPENING))
            top -= 8

        for day, month, description, amount, itf in chunk:
            fecha = f"{day:02d}-{month:02d}"
            canvas.drawString(_X_DATE, top, fecha)
            canvas.drawString(_X_VALUE_DATE, top, fecha)
            canvas.drawString(_X_DESCRIPTION, top, description)
            canvas.drawString(_X_OPERATION, top, f"{written + 1:04d}")
            canvas.drawRightString(_X_AMOUNT, top, _format(_parse(amount)))
            if itf:
                canvas.drawRightString(_X_ITF, top, _format(_parse(itf)))
            canvas.drawRightString(_X_BALANCE, top, _format(balances[written]))
            written += 1
            top -= 8

        if page_index == len(chunks) - 1 and include_itf_totals:
            top -= 16
            canvas.setFont("Helvetica-Bold", 7)
            canvas.drawString(116, top, "TOTALES POR ITF")
            top -= 8
            canvas.setFont("Helvetica", 7)
            declarado = total_itf + (Decimal("1.00") if wrong_itf_totals else Decimal("0"))
            for etiqueta, valor in (
                ("CARGOS", declarado),
                ("ABONOS", Decimal("0.00")),
                ("DEVOLUCIONES", Decimal("0.00")),
                ("PAGOS", Decimal("0.00")),
            ):
                canvas.drawString(116, top, etiqueta)
                canvas.drawRightString(185, top, _format(valor))
                top -= 8

        canvas.setFont("Helvetica", 6)
        if include_issue_date:
            canvas.drawString(187, 60, _ISSUE_DATE)
        canvas.drawString(86, 50, "BANCA POR INTERNET www.bbvabancocontinental.com")
        canvas.showPage()

    canvas.save()
    return balances[-1]
