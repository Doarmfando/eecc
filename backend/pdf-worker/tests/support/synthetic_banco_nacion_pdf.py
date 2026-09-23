"""Estado de cuenta sintético con una plantilla del Banco de la Nación.

No reproduce un documento real —todavía no se ha visto ninguno—, sino la disposición
habitual de un estado de cuenta corriente en Perú: cabecera `FECHA | DESCRIPCION |
NRO. OPER. | CARGOS | ABONOS | SALDO`, fila `SALDO ANTERIOR`, descripciones en dos
líneas, arrastre `VAN`/`VIENEN` entre páginas, fila `TOTALES` y `SALDO FINAL`. Todos
los nombres, cuentas e importes son ficticios.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas

# (día, descripción, segunda línea, número de operación, importe con signo).
_MOVEMENTS: tuple[tuple[int, str, str, str, str], ...] = (
    (2, "DEPOSITO EN EFECTIVO", "", "000101", "+2,500.00"),
    (3, "TRANSF. RECIBIDA", "CLIENTE FICTICIO UNO", "000102", "+1,250.50"),
    (4, "PAGO DE TRIBUTOS", "", "000103", "-845.00"),
    (5, "RETIRO CAJERO MULTIRED", "", "000104", "-400.00"),
    (8, "COMISION MANTENIMIENTO", "", "000105", "-6.50"),
    (9, "DETRACCION RECIBIDA", "PROVEEDOR FICTICIO DOS", "000106", "+3,120.00"),
    (10, "PAGO A PROVEEDOR", "", "000107", "-1,980.75"),
    (12, "TRANSF. RECIBIDA", "", "000108", "+640.00"),
    (15, "CARGO POR CHEQUERA", "", "000109", "-35.00"),
    (18, "PAGO DE SERVICIOS", "LUZ Y AGUA", "000110", "-212.40"),
    (22, "ABONO DE INTERESES", "", "000111", "+1.85"),
    (25, "TRANSF. ENVIADA", "", "000112", "-1,000.00"),
    (29, "DEPOSITO EN VENTANILLA", "", "000113", "+75.00"),
)
_OPENING = Decimal("1034.20")
_ROWS_PER_PAGE = 6

_X_DATE = 40
_X_DESCRIPTION = 95
_X_OPERATION = 285
_X_DEBIT = 420  # borde derecho de cada columna de importes
_X_CREDIT = 490
_X_BALANCE = 560


def _parse(text: str) -> Decimal:
    return Decimal(text.replace(",", ""))


def _format(amount: Decimal) -> str:
    text = f"{abs(amount):,.2f}"
    return f"{text}-" if amount < 0 else text


def _header(canvas: Canvas, top: float) -> None:
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(_X_DATE, top, "FECHA")
    canvas.drawString(_X_DESCRIPTION, top, "DESCRIPCION")
    canvas.drawString(_X_OPERATION, top, "NRO. OPER.")
    canvas.drawRightString(_X_DEBIT, top, "CARGOS")
    canvas.drawRightString(_X_CREDIT, top, "ABONOS")
    canvas.drawRightString(_X_BALANCE, top, "SALDO")
    canvas.line(_X_DATE, top - 4, _X_BALANCE, top - 4)


def create_synthetic_banco_nacion_pdf(
    output_path: Path,
    *,
    broken_balance: bool = False,
    include_closing: bool = True,
    short_dates: bool = False,
    repeat_header: bool = True,
    include_bank_name: bool = True,
) -> Decimal:
    """Genera el documento y devuelve el saldo final que declara.

    `broken_balance` altera un saldo intermedio; `include_closing=False` simula un
    documento truncado; `short_dates` imprime `dd/mm` y deja que el año salga del
    periodo; `repeat_header=False` imprime la cabecera solo en la primera página;
    `include_bank_name=False` quita la marca del banco.
    """

    output_path.parent.mkdir(parents=True, exist_ok=True)
    _width, height = A4
    canvas = Canvas(str(output_path), pagesize=A4, invariant=1)
    canvas.setTitle("Synthetic Banco de la Nacion-like statement")

    balances: list[Decimal] = []
    running = _OPENING
    for *_rest, amount in _MOVEMENTS:
        running += _parse(amount)
        balances.append(running)
    if broken_balance:
        balances[3] += Decimal("1.00")

    debits = -sum((_parse(m[4]) for m in _MOVEMENTS if m[4].startswith("-")), Decimal("0"))
    credits = sum((_parse(m[4]) for m in _MOVEMENTS if m[4].startswith("+")), Decimal("0"))

    chunks = [
        _MOVEMENTS[index : index + _ROWS_PER_PAGE]
        for index in range(0, len(_MOVEMENTS), _ROWS_PER_PAGE)
    ]
    written = 0
    for page_index, chunk in enumerate(chunks):
        top = height - 50
        canvas.setFont("Helvetica-Bold", 12)
        if include_bank_name:
            canvas.drawString(_X_DATE, top, "BANCO DE LA NACION")
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(_X_BALANCE, top, "ESTADO DE CUENTA CORRIENTE")
        top -= 20
        if page_index == 0:
            canvas.drawString(_X_DATE, top, "TITULAR: EMPRESA FICTICIA S.A.C.")
            canvas.drawString(_X_DATE, top - 12, "CUENTA: 00-000-000001")
            canvas.drawString(_X_DATE + 200, top - 12, "MONEDA: SOLES")
            canvas.drawString(_X_DATE, top - 24, "PERIODO: DEL 01/06/2026 AL 30/06/2026")
            top -= 50

        if page_index == 0 or repeat_header:
            _header(canvas, top)
            top -= 18

        canvas.setFont("Helvetica", 8)
        if page_index == 0:
            canvas.drawString(_X_DESCRIPTION, top, "SALDO ANTERIOR")
            canvas.drawRightString(_X_BALANCE, top, _format(_OPENING))
        else:
            canvas.drawString(_X_DESCRIPTION, top, "VIENEN")
            canvas.drawRightString(_X_BALANCE, top, _format(balances[written - 1]))
        top -= 12

        for day, description, second_line, operation, amount in chunk:
            printed_date = f"{day:02d}/06" if short_dates else f"{day:02d}/06/2026"
            canvas.drawString(_X_DATE, top, printed_date)
            canvas.drawString(_X_DESCRIPTION, top, description)
            canvas.drawString(_X_OPERATION, top, operation)
            magnitude = amount.lstrip("+-")
            column = _X_CREDIT if amount.startswith("+") else _X_DEBIT
            canvas.drawRightString(column, top, magnitude)
            canvas.drawRightString(_X_BALANCE, top, _format(balances[written]))
            written += 1
            top -= 12
            if second_line:
                canvas.drawString(_X_DESCRIPTION, top, second_line)
                top -= 12

        last_page = page_index == len(chunks) - 1
        if not last_page:
            canvas.drawString(_X_DESCRIPTION, top, "VAN")
            canvas.drawRightString(_X_BALANCE, top, _format(balances[written - 1]))
        elif include_closing:
            canvas.setFont("Helvetica-Bold", 8)
            canvas.drawString(_X_DESCRIPTION, top, "TOTALES")
            canvas.drawRightString(_X_DEBIT, top, _format(debits))
            canvas.drawRightString(_X_CREDIT, top, _format(credits))
            top -= 12
            canvas.drawString(_X_DESCRIPTION, top, "SALDO FINAL")
            canvas.drawRightString(_X_BALANCE, top, _format(balances[-1]))

        # Pie de página: ni la numeración ni el aviso legal son continuación de nada.
        canvas.setFont("Helvetica", 7)
        canvas.drawString(_X_DATE, 60, "Documento ficticio generado para pruebas automatizadas.")
        canvas.drawCentredString(300, 45, f"Pagina {page_index + 1} de {len(chunks)}")
        canvas.showPage()

    canvas.save()
    return balances[-1]


# --- Plantilla real, confirmada con un estado de cuenta del banco -------------
#
# Difiere de la de arriba en todo lo que importa, y por eso se conserva aparte:
# la fecha cierra la fila en vez de abrirla (`DIA`), la columna de detalle se
# rotula `CODIFICACION` sobre `NRO CHEQUE`, el saldo se imprime una vez por día
# y no en cada movimiento, el cierre va en dos líneas —rótulos arriba, importes
# debajo— y el saldo final lleva relleno de asteriscos. El documento no nombra
# al banco en ninguna parte. Todos los datos de aquí son inventados.

# (día, detalle, código de 4 dígitos, importe con signo).
_REAL_MOVEMENTS: tuple[tuple[int, str, str, str], ...] = (
    (1, "ITF", "0011", "-0.10"),
    (1, "DEPOSITO", "0012", "+1,200.00"),
    (2, "TRANSFERENCIA", "0013", "+450.25"),
    (2, "PAGO PROVEEDOR", "0014", "-320.00"),
    (2, "COMISION", "0015", "-15.50"),
    (5, "DEPOSITO", "0016", "+2,080.40"),
    (7, "CHEQUE PAGADO", "0017", "-900.00"),
    (7, "ABONO VARIOS", "0018", "+75.00"),
    (9, "DEPOSITO", "0019", "+310.00"),
)
_REAL_OPENING = Decimal("9864.06")
_REAL_ROWS_PER_PAGE = 5

_R_DETAIL = 32
_R_CODE = 51
_R_DEBIT = 200  # borde derecho de cada columna de importes
_R_CREDIT = 310
_R_BALANCE = 415
_R_DATE = 490


def _real_header(canvas: Canvas, top: float) -> None:
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(36, top, "CODIFICACION")
    canvas.drawString(140, top, "CARGOS")
    canvas.drawString(247, top, "ABONOS")
    canvas.drawString(359, top, "SALDOS")
    canvas.drawString(487, top, "DIA")
    canvas.drawString(_R_DETAIL, top - 9, "NRO CHEQUE")


def create_synthetic_banco_nacion_real_layout_pdf(
    output_path: Path,
    *,
    broken_daily_balance: bool = False,
    include_closing: bool = True,
    asterisk_fill: bool = True,
) -> Decimal:
    """Genera la plantilla real y devuelve el saldo final que declara.

    `broken_daily_balance` altera el saldo impreso de un día; `include_closing=False`
    deja el documento sin su bloque de cierre; `asterisk_fill=False` imprime el saldo
    final sin el relleno de protección.
    """

    output_path.parent.mkdir(parents=True, exist_ok=True)
    _width, height = A4
    canvas = Canvas(str(output_path), pagesize=A4, invariant=1)
    canvas.setTitle("Synthetic Banco de la Nacion statement (real layout)")

    balances: list[Decimal] = []
    running = _REAL_OPENING
    for *_rest, amount in _REAL_MOVEMENTS:
        running += _parse(amount)
        balances.append(running)

    # El saldo solo se imprime en el último movimiento de cada día.
    last_of_day = {
        day: max(i for i, m in enumerate(_REAL_MOVEMENTS) if m[0] == day)
        for day, *_rest in _REAL_MOVEMENTS
    }
    printed = dict.fromkeys(last_of_day.values(), True)

    debits = -sum((_parse(m[3]) for m in _REAL_MOVEMENTS if m[3].startswith("-")), Decimal("0"))
    credits = sum((_parse(m[3]) for m in _REAL_MOVEMENTS if m[3].startswith("+")), Decimal("0"))

    chunks = [
        _REAL_MOVEMENTS[index : index + _REAL_ROWS_PER_PAGE]
        for index in range(0, len(_REAL_MOVEMENTS), _REAL_ROWS_PER_PAGE)
    ]
    written = 0
    for page_index, chunk in enumerate(chunks):
        top = height - 60
        canvas.setFont("Helvetica", 8)
        canvas.drawString(_R_DETAIL, top, "EMPRESA FICTICIA SAC")
        canvas.drawString(400, top, "ESTADO DE CTA CTE AL :")
        top -= 12
        canvas.drawString(_R_DETAIL, top, "NUMERO DE CUENTA : 00-000-000001")
        top -= 12
        canvas.drawString(_R_DETAIL, top, "CODIGO DE CLIENTE : 000001-001")
        top -= 24

        _real_header(canvas, top)
        top -= 24

        canvas.setFont("Helvetica", 8)
        if page_index == 0:
            canvas.drawString(_R_DETAIL, top, "SALDO ANTERIOR")
            canvas.drawString(261, top, "30/06/2026")
            canvas.drawRightString(_R_BALANCE, top, _format(_REAL_OPENING))
            top -= 12

        for day, detail, code, amount in chunk:
            canvas.drawString(_R_DETAIL, top, detail)
            canvas.drawString(_R_CODE + 60, top, code)
            magnitude = amount.lstrip("+-")
            column = _R_CREDIT if amount.startswith("+") else _R_DEBIT
            canvas.drawRightString(column, top, magnitude)
            if printed.get(written):
                balance = balances[written]
                if broken_daily_balance and written == last_of_day[2]:
                    balance += Decimal("1.00")
                canvas.drawRightString(_R_BALANCE, top, _format(balance))
            canvas.drawString(_R_DATE, top, f"{day:02d}/07/2026")
            written += 1
            top -= 12

        if page_index == len(chunks) - 1 and include_closing:
            top -= 24
            canvas.setFont("Helvetica-Bold", 8)
            canvas.drawString(85, top, "TOTAL")
            canvas.drawString(186, top, "TOTAL CARGOS")
            canvas.drawString(293, top, "TOTAL ABONOS")
            canvas.drawString(439, top, "SALDO ACTUAL")
            top -= 12
            canvas.setFont("Helvetica", 8)
            canvas.drawString(100, top, f"{len(_REAL_MOVEMENTS):04d}")
            canvas.drawRightString(265, top, _format(debits))
            canvas.drawRightString(372, top, _format(credits))
            cierre = _format(balances[-1])
            canvas.drawString(477, top, f"*********{cierre}" if asterisk_fill else cierre)

        canvas.setFont("Helvetica", 7)
        canvas.drawCentredString(300, 45, f"Pagina : {page_index + 1}")
        canvas.showPage()

    canvas.save()
    return balances[-1]
