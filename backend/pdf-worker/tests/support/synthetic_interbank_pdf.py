"""Estado de cuenta sintético con la plantilla de ahorro de Interbank.

Reproduce la disposición observada en un documento real —cabecera repetida en cada
página, fila `EMPEZASTE <MES> CON`, importes con signo en color, fila de cierre con
totales, página publicitaria y página de guía con un ejemplo propio— con datos
completamente ficticios. Ningún nombre, cuenta ni importe proviene de un documento real.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas

_GREEN = HexColor("#05BE50")
_BLUE = HexColor("#0039A6")
_BLACK = HexColor("#111111")

# (fecha, concepto, importe con signo). El saldo se calcula, así siempre cuadra.
_MOVEMENTS: tuple[tuple[str, str, str], ...] = (
    ("02/05/2026", "YAPE-CLIENTE A", "+120.00"),
    ("02/05/2026", "PLIN-CLIENTE B", "+35.50"),
    ("03/05/2026", "I-BANC", "-80.25"),
    ("03/05/2026", "RET CAJERO", "-50.00"),
    ("05/05/2026", "YAPE-CLIENTE C", "+1,250.00"),
    ("06/05/2026", "TIENDA 305", "-12.30"),
    ("06/05/2026", "YAPE-PROVEEDOR", "-640.00"),
    ("08/05/2026", "PLIN-CLIENTE D", "+14.30"),
    ("09/05/2026", "SUSCRIPCION WEB", "-8.90"),
    ("12/05/2026", "YAPE-CLIENTE A", "+300.00"),
    ("15/05/2026", "TAXI APP", "-11.00"),
    ("18/05/2026", "YAPE-CLIENTE E", "+4.00"),
    ("20/05/2026", "I-BANC", "-420.15"),
    ("22/05/2026", "YAPE-CLIENTE B", "+62.00"),
    ("25/05/2026", "FARMACIA", "-13.20"),
    ("28/05/2026", "YAPE-CLIENTE C", "+5.00"),
    ("30/05/2026", "YAPE-OTRO", "-3.50"),
)
_OPENING = Decimal("52.40")
_ROWS_PER_PAGE = 7

_COLUMN_DATE = 50
_COLUMN_CONCEPT = 120
_COLUMN_CREDIT = 345
_COLUMN_DEBIT = 420
_COLUMN_BALANCE = 505


def _format(amount: Decimal, *, signed: bool = False) -> str:
    text = f"{abs(amount):,.2f}"
    if signed:
        return f"{'+' if amount >= 0 else '-'}{text}"
    return f"-{text}" if amount < 0 else text


def _parse(text: str) -> Decimal:
    return Decimal(text.replace(",", ""))


def _header(canvas: Canvas, top: float) -> None:
    canvas.setFillColor(_GREEN)
    canvas.rect(40, top - 8, 515, 24, stroke=0, fill=1)
    canvas.setFillColor(HexColor("#FFFFFF"))
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(_COLUMN_DATE, top, "Fecha")
    canvas.drawString(_COLUMN_CONCEPT + 60, top, "Concepto")
    canvas.drawCentredString(_COLUMN_CREDIT, top, "Ingresos")
    canvas.drawCentredString(_COLUMN_DEBIT, top, "Gastos")
    canvas.drawCentredString(_COLUMN_BALANCE, top, "Saldo Contable")


def create_synthetic_interbank_pdf(
    output_path: Path,
    *,
    broken_balance: bool = False,
    include_closing: bool = True,
    include_guide: bool = True,
    unsigned_amounts: bool = False,
) -> Decimal:
    """Genera el documento y devuelve el saldo final que declara.

    `broken_balance` altera un saldo intermedio; `include_closing=False` simula un
    documento truncado; `unsigned_amounts` imprime los importes sin signo, de modo que
    la columna solo se deduce por su posición bajo la cabecera.
    """

    output_path.parent.mkdir(parents=True, exist_ok=True)
    _width, height = A4
    canvas = Canvas(str(output_path), pagesize=A4, invariant=1)
    canvas.setTitle("Synthetic Interbank-like statement")

    balances: list[Decimal] = []
    running = _OPENING
    for _date, _concept, amount in _MOVEMENTS:
        running += _parse(amount)
        balances.append(running)
    if broken_balance:
        balances[4] += Decimal("1.00")

    credits = sum((_parse(a) for _d, _c, a in _MOVEMENTS if a.startswith("+")), Decimal("0"))
    debits = -sum((_parse(a) for _d, _c, a in _MOVEMENTS if a.startswith("-")), Decimal("0"))

    chunks = [
        _MOVEMENTS[index : index + _ROWS_PER_PAGE]
        for index in range(0, len(_MOVEMENTS), _ROWS_PER_PAGE)
    ]
    written = 0
    for page_index, chunk in enumerate(chunks):
        top = height - 60
        if page_index == 0:
            canvas.setFillColor(_BLUE)
            canvas.setFont("Helvetica-Bold", 22)
            canvas.drawString(40, top, "[logo]")
            canvas.setFont("Helvetica", 12)
            canvas.drawRightString(555, top, "ESTADO DE CUENTA")
            canvas.setFillColor(_GREEN)
            canvas.drawRightString(555, top - 16, "CUENTA SIMPLE SOLES")
            canvas.setFillColor(_BLUE)
            canvas.drawRightString(555, top - 32, "000-0000000001")
            canvas.setFillColor(_BLACK)
            canvas.drawRightString(555, top - 48, "DEL 30 DE ABRIL AL 31 DE MAYO")
            canvas.setFont("Helvetica-Bold", 16)
            canvas.drawString(50, top - 90, "TITULAR FICTICIO")
            canvas.setFont("Helvetica", 8)
            canvas.drawString(50, top - 106, "DNI 00000000")
            canvas.drawString(50, top - 120, "Tu cuenta fue aperturada el 01/01/2020")
            canvas.setFillColor(_GREEN)
            canvas.setFont("Helvetica-Bold", 12)
            canvas.drawString(50, top - 150, "DETALLE DE MOVIMIENTOS")
            top -= 185

        _header(canvas, top)
        row_y = top - 30
        if page_index == 0:
            canvas.setFillColor(_BLACK)
            canvas.setFont("Helvetica-Bold", 9)
            canvas.drawString(_COLUMN_DATE, row_y, "EMPEZASTE ABRIL CON")
            canvas.drawCentredString(_COLUMN_BALANCE, row_y, _format(_OPENING))
            row_y -= 30

        for posting_date, concept, amount in chunk:
            canvas.setFont("Helvetica", 9)
            canvas.setFillColor(_BLACK)
            canvas.drawString(_COLUMN_DATE, row_y, posting_date)
            canvas.drawString(_COLUMN_CONCEPT, row_y, concept)
            printed = amount.lstrip("+-") if unsigned_amounts else amount
            if amount.startswith("+"):
                canvas.setFillColor(_GREEN)
                # Los importes van medio punto más abajo que el concepto, como en el real.
                canvas.drawCentredString(_COLUMN_CREDIT, row_y - 0.5, printed)
            else:
                canvas.drawCentredString(_COLUMN_DEBIT, row_y - 0.5, printed)
            canvas.setFillColor(_BLACK)
            canvas.drawCentredString(_COLUMN_BALANCE, row_y, _format(balances[written]))
            written += 1
            row_y -= 30

        if include_closing and page_index == len(chunks) - 1:
            canvas.setFont("Helvetica-Bold", 9)
            canvas.drawString(_COLUMN_DATE, row_y, "SALDO CONTABLE AL 31/05")
            canvas.drawCentredString(_COLUMN_CREDIT, row_y, _format(credits, signed=True))
            canvas.drawCentredString(_COLUMN_DEBIT, row_y, _format(-debits, signed=True))
            canvas.drawCentredString(_COLUMN_BALANCE, row_y, _format(balances[-1]))
        canvas.showPage()

    # Página publicitaria sin movimientos.
    canvas.setFont("Helvetica", 10)
    canvas.drawString(50, height - 80, "Recuerda")
    canvas.drawString(50, height - 96, "Realiza GRATIS tus consultas y transferencias 24 horas.")
    canvas.showPage()

    if include_guide:
        # Guía con un ejemplo inventado que trae su propia cabecera y movimientos. Sus
        # saldos no cuadran a propósito: si se leyera, la reconciliación fallaría.
        canvas.setFont("Helvetica-Bold", 20)
        canvas.drawString(50, height - 80, "Te ayudamos a conocer")
        canvas.drawString(50, height - 104, "tu Estado de Cuenta:")
        sample_top = height - 200
        _header(canvas, sample_top)
        canvas.setFillColor(_BLACK)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(_COLUMN_DATE, sample_top - 20, "EMPEZASTE OCTUBRE CON")
        canvas.drawCentredString(_COLUMN_BALANCE, sample_top - 20, "1,234.56")
        for offset, (concept, amount, balance) in enumerate(
            (("TRANSFERENCIA", "+15.00", "9,999.99"), ("PAGO DE TARJETA", "-30.00", "8,888.88"))
        ):
            y = sample_top - 40 - offset * 16
            canvas.drawString(_COLUMN_DATE, y, "07/11/2019")
            canvas.drawString(_COLUMN_CONCEPT, y, concept)
            canvas.drawCentredString(
                _COLUMN_CREDIT if amount.startswith("+") else _COLUMN_DEBIT, y, amount
            )
            canvas.drawCentredString(_COLUMN_BALANCE, y, balance)
        canvas.showPage()

    canvas.save()
    return balances[-1]
