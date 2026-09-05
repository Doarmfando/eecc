"""Generador de una página BCP ficticia para pruebas de layout."""

from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen.canvas import Canvas

_MAXIMUM_SYNTHETIC_PAGES = 28


def _draw_page(
    canvas: Canvas,
    width: float,
    *,
    page_number: int,
    page_count: int,
    include_movements: bool,
    include_bank_marker: bool,
) -> None:
    canvas.setFillColor(HexColor("#17365D"))
    canvas.rect(25, 704, width - 50, 60, fill=1, stroke=0)
    canvas.setFillColor(HexColor("#FFFFFF"))
    canvas.setFont("Helvetica-Bold", 15)
    titulo = "BCP - ESTADO DE CUENTA SINTETICO" if include_bank_marker else "ESTADO DE CUENTA"
    canvas.drawString(42, 740, titulo)
    canvas.setFont("Helvetica", 9)
    canvas.drawString(42, 720, "DEL 01/04/26 AL 30/04/26")
    canvas.drawRightString(width - 42, 720, "CUENTA 000-00000000-0-00 - SOLES")

    table_left = 25
    table_right = 575
    table_top = 615
    table_bottom = 465
    canvas.setFillColor(HexColor("#D9EAF7"))
    canvas.rect(table_left, 585, table_right - table_left, 30, fill=1, stroke=0)
    canvas.setStrokeColor(HexColor("#7F8C8D"))
    canvas.rect(
        table_left,
        table_bottom,
        table_right - table_left,
        table_top - table_bottom,
        fill=0,
        stroke=1,
    )
    for x in (78, 120, 330, 455):
        canvas.line(x, table_bottom, x, table_top)
    for y in (585, 560, 540, 525, 495):
        canvas.line(table_left, y, table_right, y)

    canvas.setFillColor(HexColor("#17365D"))
    canvas.setFont("Helvetica-Bold", 6)
    canvas.drawCentredString((table_left + 78) / 2, 600, "FECHA PROC.")
    canvas.drawCentredString((78 + 120) / 2, 600, "FECHA VALOR")
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(130, 600, "DESCRIPCION")
    canvas.drawString(350, 600, "CARGOS")
    canvas.drawString(480, 600, "ABONOS")

    if include_movements:
        # Cada página lleva su propio día para que una lectura que mezcle el orden
        # produzca un resultado distinto en vez de pasar desapercibida.
        day = f"{page_number:02d}ABR"
        canvas.setFillColor(HexColor("#111111"))
        canvas.setFont("Helvetica", 9)
        canvas.drawString(130, 570, "SALDO ANTERIOR")
        canvas.drawRightString(560, 570, "100.00")

        canvas.drawString(35, 550, day)
        canvas.drawString(82, 550, day)
        canvas.drawString(130, 550, "OPERACION SINTETICA")
        canvas.drawRightString(445, 550, "10.00")

        canvas.setFont("Helvetica-Oblique", 8)
        canvas.drawString(130, 535, "DETALLE SINTETICO")

        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(130, 505, "TOTAL MOVIMIENTOS")
        canvas.drawRightString(445, 505, "10.00")
        canvas.drawRightString(560, 505, "0.00")

        canvas.drawString(130, 480, "SALDO")
        canvas.drawRightString(560, 480, "90.00")

    canvas.setFillColor(HexColor("#666666"))
    canvas.setFont("Helvetica", 8)
    canvas.drawString(30, 100, "ADVERTENCIA: DOCUMENTO COMPLETAMENTE SINTETICO")
    canvas.drawRightString(width - 30, 100, f"PAGINA {page_number} DE {page_count}")


def create_synthetic_bcp_pdf(
    output_path: Path,
    *,
    include_movements: bool = True,
    include_bank_marker: bool = True,
    page_count: int = 1,
) -> None:
    """Crea un documento ficticio sin datos derivados de clientes reales.

    Con `include_movements=False` conserva cabecera, tabla vacía y pie: sirve para
    comprobar que un estado de cuenta detectado pero sin filas termina en `FAILED`.

    Con `include_bank_marker=False` el nombre del banco no queda como texto, igual
    que en los estados de cuenta reales, donde vive dentro del logo.

    Con `page_count > 1` repite la estructura numerando cada página y fechando su
    movimiento con el número de página, para poder comprobar que un lector que
    reparte páginas entre procesos las devuelve en su sitio.
    """

    if not 1 <= page_count <= _MAXIMUM_SYNTHETIC_PAGES:
        raise ValueError("page_count is outside the synthetic document range")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    width, _ = letter
    canvas = Canvas(str(output_path), pagesize=letter, invariant=1)
    canvas.setTitle("Synthetic BCP statement for automated tests")

    for page_number in range(1, page_count + 1):
        _draw_page(
            canvas,
            width,
            page_number=page_number,
            page_count=page_count,
            include_movements=include_movements,
            include_bank_marker=include_bank_marker,
        )
        canvas.showPage()

    canvas.save()
