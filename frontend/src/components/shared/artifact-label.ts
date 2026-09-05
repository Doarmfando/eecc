const SHEET_LABELS: Record<string, string> = {
  Resumen: 'Resumen',
  Movimientos: 'Movimientos',
  Control_Paginas: 'Control por página',
  Validaciones: 'Validaciones',
};

/**
 * El nombre lo genera el sistema (`statement_Movimientos.csv`), no el documento
 * del usuario. Sirve para distinguir los CSV entre sí.
 */
export function describeArtifact(kind: string, name: string): string {
  const base = KIND_LABELS[kind] ?? kind;
  const sheet = /^[^_]+_(.+)\.csv$/.exec(name)?.[1];
  if (kind !== 'RESULT_CSV' || sheet === undefined) {
    return base;
  }
  return `${base} · ${SHEET_LABELS[sheet] ?? sheet}`;
}

const KIND_LABELS: Record<string, string> = {
  SOURCE_PDF: 'PDF original',
  RESULT_XLSX: 'Excel del estado de cuenta',
  RESULT_CSV: 'CSV derivado',
  TECHNICAL_MANIFEST: 'Manifiesto técnico',
};
