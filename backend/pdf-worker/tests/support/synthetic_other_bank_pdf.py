"""Estado de cuenta de un banco ficticio, con otra plantilla.

Sirve para dos cosas: comprobar que el extractor especializado de BCP lo rechaza,
y que el respaldo genérico lo lee guiándose por los nombres de sus columnas.
"""

from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen.canvas import Canvas

# Columnas con otros sinónimos que los de BCP, para ejercitar el mapeo por nombre.
_HEADERS = ("FECHA OPERACION", "CONCEPTO", "RETIROS", "DEPOSITOS", "SALDO")

# Movimientos ficticios cuyo saldo avanza de forma consistente.
_MOVEMENTS = (
    ("01/06/2026", "TRANSFERENCIA RECIBIDA", None, "1500.00", "3500.00"),
    ("02/06/2026", "PAGO DE SERVICIO", "230.50", None, "3269.50"),
    ("03/06/2026", "COMPRA CON TARJETA", "119.90", None, "3149.60"),
    ("05/06/2026", "ABONO DE INTERESES", None, "12.40", "3162.00"),
    ("07/06/2026", "RETIRO EN CAJERO", "200.00", None, "2962.00"),
    ("09/06/2026", "DEPOSITO EN VENTANILLA", None, "800.00", "3762.00"),
    ("11/06/2026", "COMISION MANTENIMIENTO", "15.00", None, "3747.00"),
)

_COLUMN_X = (40, 130, 330, 410, 495)


# Encabezados que ningún diccionario de sinónimos en español reconoce: sirven para
# comprobar que las columnas pueden deducirse de la aritmética del documento.
_FOREIGN_HEADERS = ("DT", "NARRATIVE", "WITHDRAWAL", "LODGEMENT", "BAL")


def create_synthetic_other_bank_pdf(
    output_path: Path,
    *,
    include_headers: bool = True,
    foreign_headers: bool = False,
    broken_balance: bool = False,
    pages: int = 1,
) -> None:
    """Genera el documento.

    Sin encabezados sirve como caso negativo; con `foreign_headers` los rótulos no
    pertenecen a ningún vocabulario conocido; con `broken_balance` la columna de
    saldo no avanza de forma consistente y nada puede demostrarse. Con `pages` mayor
    que uno, el encabezado aparece únicamente en la primera página, como en los
    estados de cuenta reales.
    """

    output_path.parent.mkdir(parents=True, exist_ok=True)
    width, height = letter
    canvas = Canvas(str(output_path), pagesize=letter, invariant=1)
    canvas.setTitle("Synthetic statement from a fictional bank")

    movements = (
        tuple(
            (fecha, concepto, retiro, deposito, str(1000 + index * 7))
            for index, (fecha, concepto, retiro, deposito, _) in enumerate(_MOVEMENTS)
        )
        if broken_balance
        else _MOVEMENTS
    )
    headers = _FOREIGN_HEADERS if foreign_headers else _HEADERS
    per_page = max(1, len(movements) // max(pages, 1))

    for page_index in range(max(pages, 1)):
        canvas.setFillColor(HexColor("#1B4332"))
        canvas.setFont("Helvetica-Bold", 14)
        canvas.drawString(40, height - 60, "BANCO FICTICIO DEL SUR")
        canvas.setFont("Helvetica", 10)
        canvas.drawString(40, height - 78, "ESTADO DE CUENTA")
        canvas.drawString(40, height - 94, "PERIODO: 01/06/2026 - 30/06/2026")
        canvas.drawString(40, height - 110, "CUENTA: 0011-0345-0200123456")

        top = height - 150
        # El encabezado solo va en la primera página, como en un documento real.
        if include_headers and page_index == 0:
            canvas.setFillColor(HexColor("#111111"))
            canvas.setFont("Helvetica-Bold", 8)
            canvas.drawString(_COLUMN_X[0], top, headers[0])
            canvas.drawString(_COLUMN_X[1], top, headers[1])
            for x, header in zip(_COLUMN_X[2:], headers[2:], strict=True):
                canvas.drawRightString(x + 60, top, header)
            canvas.line(40, top - 5, width - 40, top - 5)

        start = page_index * per_page
        end = len(movements) if page_index == max(pages, 1) - 1 else start + per_page
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(HexColor("#111111"))
        row_y = top - 22
        for fecha, concepto, retiro, deposito, saldo in movements[start:end]:
            canvas.drawString(_COLUMN_X[0], row_y, fecha)
            canvas.drawString(_COLUMN_X[1], row_y, concepto)
            if retiro:
                canvas.drawRightString(_COLUMN_X[2] + 60, row_y, retiro)
            if deposito:
                canvas.drawRightString(_COLUMN_X[3] + 60, row_y, deposito)
            canvas.drawRightString(_COLUMN_X[4] + 60, row_y, saldo)
            row_y -= 18

        canvas.setFillColor(HexColor("#666666"))
        canvas.setFont("Helvetica", 8)
        canvas.drawString(40, 60, "DOCUMENTO COMPLETAMENTE FICTICIO PARA PRUEBAS")
        canvas.showPage()

    canvas.save()
