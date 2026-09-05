"""
Convierte un archivo Excel (.xlsx) a CSV

Uso:
    python convertir_excel_a_csv.py
    
Las hojas se guardarán como archivos CSV separados con el nombre:
    nombre_archivo_[nombre_hoja].csv
"""

import csv
from pathlib import Path
from openpyxl import load_workbook

# Ruta del archivo Excel
archivo_excel = Path("2026_JUNIO_BCPxd.xlsx")

if not archivo_excel.exists():
    print(f"❌ No se encontró el archivo: {archivo_excel}")
    exit(1)

print(f"📄 Leyendo: {archivo_excel}")

try:
    # Abrir el archivo Excel
    wb = load_workbook(archivo_excel)
    
    print(f"✅ Encontradas {len(wb.sheetnames)} hoja(s): {wb.sheetnames}")
    
    # Convertir cada hoja a CSV
    for nombre_hoja in wb.sheetnames:
        ws = wb[nombre_hoja]
        nombre_csv = f"2026_JUNIO_BCP_{nombre_hoja}.csv"
        
        # Escribir los datos a CSV
        with open(nombre_csv, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            for row in ws.iter_rows(values_only=True):
                writer.writerow(row)
        
        num_filas = ws.max_row
        num_cols = ws.max_column
        print(f"✅ Convertida hoja '{nombre_hoja}' → {nombre_csv}")
        print(f"   └─ {num_filas} filas × {num_cols} columnas")
    
    print("\n✨ ¡Conversión completada!")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
