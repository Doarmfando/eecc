
import re
import pdfplumber
import pandas as pd
from pathlib import Path
from tqdm import tqdm


# =========================================================
# CONFIGURACIÓN DE RUTAS
# =========================================================
# Rutas de ejemplo. Solo las usa el bloque `__main__` del final: apunta estas dos
# a tu documento local. Aquí no se escriben nombres de titulares reales.
PDF_PATH = r"referencias\estado-de-cuenta.pdf"
EXCEL_OUTPUT = r"referencias\estado-de-cuenta.xlsx"


# =========================================================
# FUNCIONES AUXILIARES
# =========================================================
def limpiar_texto(valor):
    if valor is None:
        return ""
    return str(valor).replace("\n", " ").strip()


def convertir_numero(valor):
    """
    Convierte textos tipo:
    422,546.01 -> 422546.01
    -120.00 -> -120.00
    """
    valor = limpiar_texto(valor)

    if not valor:
        return None

    valor = valor.replace(",", "")

    try:
        return float(valor)
    except ValueError:
        return None


MESES_BCP = {
    "ENE": "01",
    "FEB": "02",
    "MAR": "03",
    "ABR": "04",
    "MAY": "05",
    "JUN": "06",
    "JUL": "07",
    "AGO": "08",
    "SET": "09",
    "SEP": "09",
    "OCT": "10",
    "NOV": "11",
    "DIC": "12",
}


def es_fecha_bcp(valor):
    """
    Valida fechas tipo BCP:
    31MAR
    01ABR
    """
    return bool(re.fullmatch(r"\d{2}[A-ZÁÉÍÓÚÑ]{3}", limpiar_texto(valor).upper()))


def normalizar_fecha_bcp(fecha, anio):
    """
    Convierte:
    01ABR + 2026 -> 01/04/2026
    """
    fecha = limpiar_texto(fecha).upper()

    if not fecha:
        return ""

    if es_fecha_bcp(fecha):
        dia = fecha[:2]
        mes_txt = fecha[2:5]
        mes = MESES_BCP.get(mes_txt, "")
        if mes and anio:
            return f"{dia}/{mes}/{anio}"

    return fecha


def obtener_anio_estado_bcp(texto):
    """
    Busca el año desde textos como:
    DEL 01/04/26 AL 30/04/26
    """
    match = re.search(r"DEL\s+\d{2}/\d{2}/(\d{2,4})\s+AL\s+\d{2}/\d{2}/(\d{2,4})", texto, re.IGNORECASE)
    if match:
        anio = match.group(2)
        return "20" + anio if len(anio) == 2 else anio

    match = re.search(r"\d{2}/\d{2}/(\d{2,4})", texto)
    if match:
        anio = match.group(1)
        return "20" + anio if len(anio) == 2 else anio

    return ""


def extraer_metadata_bcp(texto):
    """
    Extrae encabezado general del BCP.
    """
    metadata = {
        "banco": "BCP",
        "tipo_cuenta": "",
        "titular": "",
        "direccion": "",
        "codigo_cuenta": "",
        "moneda": "",
        "periodo": "",
        "fecha_inicio": "",
        "fecha_fin": "",
        "pagina_inicial": "",
        "total_paginas_declarado": "",
    }

    lineas = [l.strip() for l in texto.split("\n") if l.strip()]
    texto_join = " ".join(lineas)

    for linea in lineas:
        linea_upper = linea.upper()

        if "ESTADO DE CUENTA" in linea_upper:
            metadata["tipo_cuenta"] = linea.strip()

        if "EMPRESA DE TRANSPORTES" in linea_upper or "EMPRESA DE TRANSPORTE" in linea_upper:
            if not metadata["titular"]:
                metadata["titular"] = linea.strip()

        if "URB." in linea_upper or "MZ." in linea_upper or "AV." in linea_upper:
            if not metadata["direccion"]:
                metadata["direccion"] = linea.strip()

    # Página: 1 DE 425
    match_pag = re.search(r"\b(\d+)\s+DE\s+(\d+)\b", texto_join, re.IGNORECASE)
    if match_pag:
        metadata["pagina_inicial"] = match_pag.group(1)
        metadata["total_paginas_declarado"] = match_pag.group(2)

    # Código de cuenta y moneda:
    # 191-12345678-0-11 SOLES
    match_cuenta = re.search(r"(\d{3}-\d{8}-\d-\d{2})\s+([A-Z]+)", texto_join)
    if match_cuenta:
        metadata["codigo_cuenta"] = match_cuenta.group(1)
        metadata["moneda"] = match_cuenta.group(2)

    # Periodo:
    # DEL 01/04/26 AL 30/04/26
    match_periodo = re.search(r"DEL\s+(\d{2}/\d{2}/\d{2,4})\s+AL\s+(\d{2}/\d{2}/\d{2,4})", texto_join, re.IGNORECASE)
    if match_periodo:
        fi = match_periodo.group(1)
        ff = match_periodo.group(2)
        metadata["periodo"] = f"DEL {fi} AL {ff}"
        metadata["fecha_inicio"] = fi
        metadata["fecha_fin"] = ff

    return metadata


def agrupar_words_por_fila(words, tolerancia_y=2.8):
    """
    Agrupa palabras por posición vertical.
    """
    filas = []
    words_ordenados = sorted(words, key=lambda w: (round(w["top"], 1), w["x0"]))

    for word in words_ordenados:
        agregado = False

        for fila in filas:
            if abs(fila["top"] - word["top"]) <= tolerancia_y:
                fila["words"].append(word)
                agregado = True
                break

        if not agregado:
            filas.append({
                "top": word["top"],
                "words": [word]
            })

    for fila in filas:
        fila["words"] = sorted(fila["words"], key=lambda w: w["x0"])

    return filas


def clasificar_columna_bcp(x_centro):
    """
    Clasificación por coordenadas del formato BCP.

    Columnas detectadas:
    - FECHA PROC.      x 30  a 78
    - FECHA VALOR      x 78  a 120
    - DESCRIPCIÓN      x 120 a 330
    - CARGOS / DEBE    x 330 a 455
    - ABONOS / HABER   x 455 a 570

    Nota:
    El BCP de este formato no muestra saldo por cada movimiento.
    El saldo aparece como SALDO ANTERIOR y SALDO final.
    """
    if 30 <= x_centro < 78:
        return "fecha_proc"
    elif 78 <= x_centro < 120:
        return "fecha_valor"
    elif 120 <= x_centro < 330:
        return "descripcion"
    elif 330 <= x_centro < 455:
        return "cargo"
    elif 455 <= x_centro < 570:
        return "abono"
    else:
        return "fuera_tabla"


def detectar_limites_tabla_bcp(words):
    """
    Detecta dinámicamente el rango vertical de la tabla BCP.

    Inicio:
    - Debajo de la cabecera FECHA PROC. / FECHA VALOR / DESCRIPCION.

    Fin:
    - Antes de Advertencia / MENSAJE AL CLIENTE.
    - Si no encuentra pie, usa un límite amplio de respaldo.
    """
    y_inicio = 210
    y_fin_respaldo = 690

    tops_header = []
    tops_footer = []

    for w in words:
        texto = limpiar_texto(w.get("text", "")).upper()
        top = w.get("top", 0)

        if texto in ["PROC.", "VALOR", "DESCRIPCION", "CARGOS", "ABONOS"] and 150 <= top <= 260:
            tops_header.append(top)

        if texto.startswith("ADVERTENCIA") or texto == "MENSAJE":
            if top > 300:
                tops_footer.append(top)

    if tops_header:
        y_inicio = max(tops_header) + 8

    if tops_footer:
        y_fin = min(tops_footer) - 4
    else:
        y_fin = y_fin_respaldo

    return y_inicio, y_fin


def es_fila_footer_o_ruido_bcp(texto):
    texto = texto.upper().strip()

    patrones_ruido = [
        "FECHA PROC",
        "FECHA VALOR",
        "DESCRIPCION",
        "CARGOS / DEBE",
        "ABONOS / HABER",
        "ADVERTENCIA",
        "MENSAJE AL CLIENTE",
        "DEFENSOR DEL CLIENTE",
        "INDECOPI",
        "OFICINAS",
        "311-9898",
        "ESTADO DE CUENTA",
        "CODIGO DE CUENTA",
        "MONEDA",
        "PAGINA",
    ]

    return any(p in texto for p in patrones_ruido)


def procesar_fila_bcp(fila, pagina, anio):
    """
    Procesa una fila visual de la tabla BCP.
    """
    datos = {
        "pagina_pdf": pagina,
        "tipo_fila": "MOVIMIENTO",
        "fecha_proc": "",
        "fecha_valor": "",
        "descripcion": "",
        "cargo": None,
        "abono": None,
        "saldo": None,
    }

    columnas = {
        "fecha_proc": [],
        "fecha_valor": [],
        "descripcion": [],
        "cargo": [],
        "abono": [],
    }

    for word in fila["words"]:
        texto = limpiar_texto(word["text"])
        x_centro = (word["x0"] + word["x1"]) / 2
        columna = clasificar_columna_bcp(x_centro)

        if columna in columnas:
            columnas[columna].append(texto)

    texto_completo = " ".join(
        " ".join(v) for v in columnas.values()
    ).strip()

    if not texto_completo:
        return None

    if es_fila_footer_o_ruido_bcp(texto_completo):
        return None

    fecha_proc = " ".join(columnas["fecha_proc"]).strip()
    fecha_valor = " ".join(columnas["fecha_valor"]).strip()
    descripcion = " ".join(columnas["descripcion"]).strip()
    cargo = " ".join(columnas["cargo"]).strip()
    abono = " ".join(columnas["abono"]).strip()

    texto_upper = texto_completo.upper()

    # SALDO ANTERIOR aparece con monto en ABONOS/HABER.
    if "SALDO ANTERIOR" in texto_upper:
        datos["tipo_fila"] = "SALDO_ANTERIOR"
        datos["descripcion"] = "SALDO ANTERIOR"
        datos["saldo"] = convertir_numero(abono or cargo)
        return datos

    # TOTAL MOVIMIENTO aparece al final de algunas hojas.
    if "TOTAL MOVIMIENTO" in texto_upper:
        datos["tipo_fila"] = "TOTAL_MOVIMIENTO"
        datos["descripcion"] = "TOTAL MOVIMIENTO"
        datos["cargo"] = convertir_numero(cargo)
        datos["abono"] = convertir_numero(abono)
        return datos

    # SALDO final de hoja / estado.
    if texto_upper == "SALDO" or texto_upper.startswith("SALDO "):
        datos["tipo_fila"] = "SALDO"
        datos["descripcion"] = "SALDO"
        datos["saldo"] = convertir_numero(abono or cargo)
        return datos

    # Movimiento normal: debe tener fecha proc y fecha valor.
    if es_fecha_bcp(fecha_proc) and es_fecha_bcp(fecha_valor):
        datos["fecha_proc"] = normalizar_fecha_bcp(fecha_proc, anio)
        datos["fecha_valor"] = normalizar_fecha_bcp(fecha_valor, anio)
        datos["descripcion"] = descripcion
        datos["cargo"] = convertir_numero(cargo)
        datos["abono"] = convertir_numero(abono)
        return datos

    # Continuación: si no tiene fechas, pero tiene texto, se une luego a la operación anterior.
    if descripcion:
        return {
            "pagina_pdf": pagina,
            "tipo_fila": "CONTINUACION",
            "fecha_proc": "",
            "fecha_valor": "",
            "descripcion": descripcion,
            "cargo": convertir_numero(cargo),
            "abono": convertir_numero(abono),
            "saldo": None,
        }

    return None


def unir_continuaciones(df):
    """
    Une filas de continuación a la descripción de la operación anterior.
    """
    registros_finales = []

    for _, row in df.iterrows():
        row_dict = row.to_dict()

        if row_dict["tipo_fila"] == "CONTINUACION":
            if registros_finales:
                texto_extra = limpiar_texto(row_dict.get("descripcion", ""))
                if texto_extra:
                    registros_finales[-1]["descripcion"] = (
                        limpiar_texto(registros_finales[-1]["descripcion"])
                        + " | "
                        + texto_extra
                    )

                # Si la continuación trae importes, los conserva si la fila anterior no tenía.
                if pd.isna(registros_finales[-1].get("cargo")) and pd.notna(row_dict.get("cargo")):
                    registros_finales[-1]["cargo"] = row_dict.get("cargo")

                if pd.isna(registros_finales[-1].get("abono")) and pd.notna(row_dict.get("abono")):
                    registros_finales[-1]["abono"] = row_dict.get("abono")

            continue

        registros_finales.append(row_dict)

    return pd.DataFrame(registros_finales)


def preparar_pdf_para_lectura(pdf_path):
    """
    Valida el archivo y corrige PDFs que tengan bytes basura antes de %PDF-.

    Algunos estados de cuenta pueden comenzar, por ejemplo, con:
        b"$BOP$%PDF-1.5"

    pdfplumber/pdfminer puede fallar con "No /Root object" porque las
    referencias internas quedan desplazadas. En ese caso se crea una copia
    temporal limpia junto al PDF original, sin modificar el archivo fuente.
    """
    pdf_path = Path(pdf_path)

    if not pdf_path.exists():
        raise FileNotFoundError(f"No existe el PDF: {pdf_path}")

    if not pdf_path.is_file():
        raise ValueError(f"La ruta no corresponde a un archivo: {pdf_path}")

    if pdf_path.stat().st_size == 0:
        raise ValueError(f"El PDF está vacío: {pdf_path}")

    contenido = pdf_path.read_bytes()
    posicion_pdf = contenido.find(b"%PDF-")

    if posicion_pdf == -1:
        cabecera = contenido[:20]
        raise ValueError(
            "El archivo no contiene una cabecera PDF válida (%PDF-).\n"
            f"Cabecera encontrada: {cabecera!r}\n"
            f"Archivo: {pdf_path}"
        )

    # El archivo ya comienza correctamente.
    if posicion_pdf == 0:
        return pdf_path, False

    pdf_limpio = pdf_path.with_name(
        f"{pdf_path.stem}_TEMP_LIMPIO{pdf_path.suffix}"
    )

    # Reutiliza la copia únicamente si ya coincide con el contenido limpio.
    contenido_limpio = contenido[posicion_pdf:]
    if not pdf_limpio.exists() or pdf_limpio.read_bytes() != contenido_limpio:
        pdf_limpio.write_bytes(contenido_limpio)

    print("========================================")
    print("PDF CON CABECERA DESPLAZADA DETECTADO")
    print(f"Bytes eliminados antes de %PDF-: {posicion_pdf}")
    print(f"PDF original: {pdf_path}")
    print(f"Copia temporal limpia: {pdf_limpio}")
    print("========================================")

    return pdf_limpio, True


# =========================================================
# PROCESO PRINCIPAL
# =========================================================
def extraer_bcp_pdf_a_excel(pdf_path, excel_output):
    pdf_original = Path(pdf_path)
    excel_output = Path(excel_output)

    # Corrige automáticamente archivos con bytes como $BOP$ antes de %PDF-.
    pdf_path, fue_corregido = preparar_pdf_para_lectura(pdf_original)

    movimientos = []
    paginas_control = []
    metadata_general = {}
    anio_estado = ""

    with pdfplumber.open(str(pdf_path)) as pdf:
        for num_pagina, page in enumerate(tqdm(pdf.pages, desc="Procesando BCP"), start=1):
            # Para rendimiento: solo extraemos texto completo en la primera página.
            # En PDFs grandes de BCP (400+ páginas), extract_text() por página ralentiza bastante.
            texto = page.extract_text() or "" if num_pagina == 1 else ""

            if num_pagina == 1:
                metadata_general = extraer_metadata_bcp(texto)
                anio_estado = obtener_anio_estado_bcp(texto)

            # Recortamos solo la zona donde aparece la tabla.
            # Esto mejora bastante el rendimiento en estados BCP con muchas páginas.
            page_tabla = page.crop((25, 195, 575, 730))

            words = page_tabla.extract_words(
                x_tolerance=1,
                y_tolerance=2,
                keep_blank_chars=False
            )

            y_inicio_tabla, y_fin_tabla = detectar_limites_tabla_bcp(words)

            words_tabla = [
                w for w in words
                if y_inicio_tabla <= w["top"] <= y_fin_tabla
            ]

            filas = agrupar_words_por_fila(words_tabla, tolerancia_y=2.8)

            filas_extraidas_pagina = 0

            for fila in filas:
                registro = procesar_fila_bcp(fila, num_pagina, anio_estado)

                if registro:
                    movimientos.append(registro)
                    filas_extraidas_pagina += 1

            paginas_control.append({
                "pagina_pdf": num_pagina,
                "filas_extraidas": filas_extraidas_pagina,
                "texto_detectado": "SI" if words else "NO",
                "y_inicio_tabla": round(y_inicio_tabla, 2),
                "y_fin_tabla": round(y_fin_tabla, 2)
            })

    df_mov = pd.DataFrame(movimientos)

    if df_mov.empty:
        raise ValueError(
            "No se extrajo información. Puede que el PDF sea escaneado "
            "o que las coordenadas del formato BCP deban ajustarse."
        )

    df_mov = unir_continuaciones(df_mov)

    columnas_finales = [
        "pagina_pdf",
        "tipo_fila",
        "fecha_proc",
        "fecha_valor",
        "descripcion",
        "cargo",
        "abono",
        "saldo",
    ]

    df_mov = df_mov[columnas_finales]

    df_meta = pd.DataFrame([
        {"campo": k, "valor": v}
        for k, v in metadata_general.items()
    ])

    df_control = pd.DataFrame(paginas_control)

    df_movimientos_reales = df_mov[df_mov["tipo_fila"] == "MOVIMIENTO"].copy()

    ultimo_saldo = None
    saldos_validos = df_mov["saldo"].dropna()
    if not saldos_validos.empty:
        ultimo_saldo = saldos_validos.iloc[-1]

    df_resumen = pd.DataFrame([{
        "archivo_pdf": pdf_original.name,
        "total_paginas": len(df_control),
        "total_filas_extraidas": len(df_mov),
        "total_movimientos": len(df_movimientos_reales),
        "moneda": metadata_general.get("moneda", ""),
        "tipo_cuenta": metadata_general.get("tipo_cuenta", ""),
        "codigo_cuenta": metadata_general.get("codigo_cuenta", ""),
        "periodo": metadata_general.get("periodo", ""),
        "total_cargos": df_movimientos_reales["cargo"].sum(skipna=True),
        "total_abonos": df_movimientos_reales["abono"].sum(skipna=True),
        "ultimo_saldo_detectado": ultimo_saldo,
    }])

    excel_output.parent.mkdir(parents=True, exist_ok=True)

    with pd.ExcelWriter(str(excel_output), engine="openpyxl") as writer:
        df_resumen.to_excel(writer, sheet_name="Resumen", index=False)
        df_meta.to_excel(writer, sheet_name="Encabezado", index=False)
        df_mov.to_excel(writer, sheet_name="Movimientos", index=False)
        df_control.to_excel(writer, sheet_name="Control_Paginas", index=False)

        workbook = writer.book

        for sheet_name in workbook.sheetnames:
            ws = workbook[sheet_name]

            ws.freeze_panes = "A2"
            ws.auto_filter.ref = ws.dimensions

            for col in ws.columns:
                max_length = 0
                col_letter = col[0].column_letter

                for cell in col:
                    value = cell.value
                    if value is not None:
                        max_length = max(max_length, len(str(value)))

                ws.column_dimensions[col_letter].width = min(max_length + 3, 65)

        # Formato numérico en hoja Movimientos
        ws = workbook["Movimientos"]

        # F = cargo, G = abono, H = saldo
        for row in range(2, ws.max_row + 1):
            ws[f"F{row}"].number_format = '#,##0.00'
            ws[f"G{row}"].number_format = '#,##0.00'
            ws[f"H{row}"].number_format = '#,##0.00'

    print("========================================")
    print("EXTRACCIÓN BCP FINALIZADA")
    print(f"PDF original: {pdf_original}")
    if fue_corregido:
        print(f"PDF procesado: {pdf_path}")
    print(f"Excel generado: {excel_output}")
    print(f"Filas extraídas: {len(df_mov)}")
    print("========================================")


# =========================================================
# EJECUCIÓN
# =========================================================
if __name__ == "__main__":
    extraer_bcp_pdf_a_excel(PDF_PATH, EXCEL_OUTPUT)
