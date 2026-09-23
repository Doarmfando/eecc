/**
 * Lector de los CSV que publica el worker (RFC 4180, `utf-8-sig`, `\r\n`).
 *
 * No es un lector genérico: solo tiene que entender lo que escribe
 * `exporters/csv_export.py`, que cita con comillas dobles y las duplica dentro
 * del campo. Se lee en el navegador porque los movimientos no se persisten en
 * ninguna base de datos; ver `ADR-0010`.
 */

/** El BOM de `utf-8-sig` acabaría pegado a la primera cabecera si no se quita. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  // Un campo vacío al final de la última línea no es una fila: solo hay fila
  // pendiente si se leyó algo después del último salto.
  let started = false;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  const source = stripBom(text);
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i] ?? '';
    started = true;

    if (quoted) {
      if (char === '"') {
        // `""` dentro de comillas es una comilla literal, no el cierre del campo.
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      endField();
    } else if (char === '\n') {
      endRow();
    } else if (char === '\r') {
      // `\r\n` cierra la fila en el `\n`; un `\r` suelto también.
      if (source[i + 1] !== '\n') {
        endRow();
      }
    } else {
      field += char;
    }
  }

  if (started || field !== '' || row.length > 0) {
    endRow();
  }
  return rows;
}

/** Quita acentos y mayúsculas para comparar cabeceras sin depender de su grafía. */
export function normalizeHeader(header: string): string {
  return header.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export interface CsvTable {
  /** Cabecera normalizada -> índice de columna. */
  columns: ReadonlyMap<string, number>;
  rows: readonly (readonly string[])[];
}

/** Separa cabecera y cuerpo. Una tabla sin cabecera legible queda vacía. */
export function readCsvTable(text: string): CsvTable {
  const [header, ...rows] = parseCsv(text);
  if (!header) {
    return { columns: new Map(), rows: [] };
  }
  const columns = new Map<string, number>();
  header.forEach((name, index) => {
    const key = normalizeHeader(name);
    if (key && !columns.has(key)) {
      columns.set(key, index);
    }
  });
  // Una fila más corta que la cabecera no se descarta: se lee lo que trae.
  return { columns, rows: rows.filter((row) => row.some((cell) => cell !== '')) };
}

/**
 * Primera columna presente de entre varios nombres posibles.
 *
 * Cada extractor rotula a su manera la misma magnitud (`Cargo`, `Cargos`,
 * `Gastos`), así que la lectura pregunta por todos los rótulos que conoce.
 */
export function readCell(
  table: CsvTable,
  row: readonly string[],
  ...headers: readonly string[]
): string {
  for (const header of headers) {
    const index = table.columns.get(normalizeHeader(header));
    if (index !== undefined) {
      return row[index] ?? '';
    }
  }
  return '';
}
