const SHEET_LABELS: Record<string, string> = {
  Resumen: 'Resumen',
  Encabezado: 'Encabezado',
  Movimientos: 'Movimientos',
  Control_Paginas: 'Control por página',
  Validaciones: 'Validaciones',
};

/** La hoja de un CSV del resultado, sacada del nombre que generó el sistema. */
function sheetOf(name: string): string | undefined {
  return /^[^_]+_(.+)\.csv$/.exec(name)?.[1];
}

/**
 * El nombre lo genera el sistema (`statement_Movimientos.csv`), no el documento
 * del usuario. Sirve para distinguir los CSV entre sí.
 */
export function describeArtifact(kind: string, name: string): string {
  const base = KIND_LABELS[kind] ?? kind;
  const sheet = sheetOf(name);
  if (kind !== 'RESULT_CSV' || sheet === undefined) {
    return base;
  }
  return `${base} · ${SHEET_LABELS[sheet] ?? sheet}`;
}

/** Caracteres que Windows no admite en un nombre de archivo, más los de control. */
// eslint-disable-next-line no-control-regex
const UNSAFE_FILE_NAME = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * Con qué nombre se guarda una descarga: el del PDF que subió la persona, para
 * que el Excel de `Agosto BBVA.pdf` sea `Agosto BBVA.xlsx`.
 *
 * Se decide en el navegador, que ya conoce el nombre: la API sigue sirviendo
 * cada archivo con un nombre derivado del trabajo (ADR-0011). Sin nombre de
 * origen, o para algo que no sea el PDF, el Excel o un CSV, se usa el del servidor.
 */
export function savedFileName(
  artifact: { kind: string; name: string },
  sourceFileName: string | null | undefined,
  serverFileName: string,
): string {
  const stem = (sourceFileName ?? '')
    .replace(/\.pdf$/i, '')
    .replace(UNSAFE_FILE_NAME, '_')
    .replace(/[. ]+$/, '')
    .trim();
  if (!stem) {
    return serverFileName;
  }
  switch (artifact.kind) {
    case 'SOURCE_PDF':
      return `${stem}.pdf`;
    case 'RESULT_XLSX':
      return `${stem}.xlsx`;
    case 'RESULT_CSV': {
      const sheet = sheetOf(artifact.name);
      return sheet === undefined ? serverFileName : `${stem}_${sheet}.csv`;
    }
    default:
      return serverFileName;
  }
}

const KIND_LABELS: Record<string, string> = {
  SOURCE_PDF: 'PDF original',
  RESULT_XLSX: 'Excel del estado de cuenta',
  RESULT_CSV: 'CSV derivado',
  TECHNICAL_MANIFEST: 'Manifiesto técnico',
};
