import { readCell, readCsvTable, type CsvTable } from '@/lib/csv';
import type { Currency } from '@/lib/format';
import { parseCents } from '@/lib/money';
import { getMonthLabel } from '@/lib/month';

import { bankFromExtractor } from './bank-accent';
import type { FinancialStatement, FinancialTransaction } from './types';

/**
 * Arma un estado de cuenta del Centro Financiero con los CSV que el worker ya
 * publicó para un trabajo.
 *
 * Cada extractor rotula sus columnas a su manera y no todos declaran lo mismo
 * (BCP no imprime saldo inicial; el respaldo genérico no imprime totales), así
 * que la lectura pregunta por los rótulos que conoce y deriva lo que falte de lo
 * que sí está. Nada se recalcula cuando el documento lo declara: si el estado de
 * cuenta dice cuánto sumaron los abonos, ese es el número que se muestra.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `Tipo de fila` solo lo trae BCP, cuya hoja incluye saldos y totales además de movimientos. */
const MOVEMENT_ROW_TYPE = 'MOVEMENT';
const PREVIOUS_BALANCE_ROW_TYPE = 'PREVIOUS_BALANCE';

interface MovementRow {
  rowType: string;
  date: string;
  description: string;
  debitCents: number;
  creditCents: number;
  /** Impuesto a las Transacciones Financieras que el BBVA imprime aparte; 0 si no hay. */
  itfCents: number;
  balanceCents: number | null;
}

/** Cómo se muestra el ITF cuando el banco lo cobra en columna propia. */
export const ITF_DESCRIPTION = 'ITF';

function readMovementRow(table: CsvTable, row: readonly string[]): MovementRow {
  // El BBVA imprime cargo y abono en una sola columna con signo.
  const signed = parseCents(readCell(table, row, 'Cargo/Abono'));
  return {
    rowType: readCell(table, row, 'Tipo de fila').trim(),
    date: readCell(table, row, 'Fecha proceso', 'Fecha oper.', 'Fecha').trim(),
    description: readCell(table, row, 'Descripción', 'Concepto').trim(),
    debitCents:
      signed === null
        ? Math.abs(parseCents(readCell(table, row, 'Cargo', 'Cargos', 'Gastos')) ?? 0)
        : Math.max(-signed, 0),
    creditCents:
      signed === null
        ? Math.abs(parseCents(readCell(table, row, 'Abono', 'Abonos', 'Ingresos')) ?? 0)
        : Math.max(signed, 0),
    itfCents: Math.abs(parseCents(readCell(table, row, 'ITF')) ?? 0),
    balanceCents: parseCents(readCell(table, row, 'Saldo', 'Saldo contable')),
  };
}

/**
 * Una fila es un movimiento si el documento la clasificó como tal o, cuando no
 * hay clasificación, si trae fecha e importe. Así no entran al flujo las filas
 * de saldo anterior, totales o continuación.
 */
function isMovement(row: MovementRow): boolean {
  if (row.rowType) {
    return row.rowType === MOVEMENT_ROW_TYPE;
  }
  return (
    ISO_DATE.test(row.date) && (row.debitCents !== 0 || row.creditCents !== 0 || row.itfCents !== 0)
  );
}

/**
 * Categoría deducida del texto de la descripción.
 *
 * Es una ayuda de lectura y de búsqueda, no un dato del banco: ningún extractor
 * exporta categorías. Por eso la tabla es corta y conservadora, y lo que no
 * encaja queda en «Otros movimientos» en vez de forzar una etiqueta.
 */
const CATEGORY_RULES: readonly (readonly [RegExp, string])[] = [
  [/\bitf\b|impuesto|sunat|tributo|detracc/i, 'Impuestos'],
  [/comisi[oó]n|mantenimiento de cuenta|portes/i, 'Comisiones'],
  [/planilla|n[oó]mina|haberes|sueldo/i, 'Nómina'],
  [/inter[eé]s|rendimiento/i, 'Rendimientos'],
  [/cajero|retiro/i, 'Retiros'],
  [/dep[oó]sito/i, 'Depósitos'],
  [/transferencia|interbancaria|cce\b|plin|yape/i, 'Transferencias'],
  [/pago de servicio|luz|agua|internet|telefon|recibo/i, 'Servicios'],
  [/alquiler|arrendamiento/i, 'Alquileres'],
];

export function inferCategory(description: string): string {
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(description)) {
      return category;
    }
  }
  return 'Otros movimientos';
}

interface DeclaredSummary {
  moneda: Currency | null;
  saldoInicial: number | null;
  abonos: number | null;
  cargos: number | null;
  /** Total de ITF, que el BBVA declara aparte de los cargos. */
  itf: number | null;
  saldoFinal: number | null;
}

const CURRENCIES: ReadonlySet<string> = new Set<Currency>(['PEN', 'USD']);

function readCurrency(raw: string): Currency | null {
  const code = raw.trim().toUpperCase();
  return CURRENCIES.has(code) ? (code as Currency) : null;
}

/** Lee la hoja `Resumen`, que no todos los extractores llenan igual. */
export function readSummary(csv: string | null): DeclaredSummary {
  const empty: DeclaredSummary = {
    moneda: null,
    saldoInicial: null,
    abonos: null,
    cargos: null,
    itf: null,
    saldoFinal: null,
  };
  if (!csv) {
    return empty;
  }
  const table = readCsvTable(csv);
  const row = table.rows[0];
  if (!row) {
    return empty;
  }
  return {
    moneda: readCurrency(readCell(table, row, 'Moneda')),
    saldoInicial: parseCents(readCell(table, row, 'Saldo inicial', 'Saldo anterior')),
    abonos: parseCents(readCell(table, row, 'Total abonos', 'Total ingresos')),
    cargos: parseCents(readCell(table, row, 'Total cargos', 'Total gastos')),
    itf: parseCents(readCell(table, row, 'Total ITF')),
    saldoFinal: parseCents(readCell(table, row, 'Saldo final', 'Saldo contable final')),
  };
}

/**
 * Moneda de un documento que no la declara: el respaldo genérico no la lee y
 * los BCP procesados antes de publicarla no la traen. Todas esas muestras son
 * cuentas en soles, que es además como se mostraban hasta ahora.
 */
const UNDECLARED_CURRENCY: Currency = 'PEN';

/**
 * El mes del estado de cuenta: aquel donde cae la mayoría de sus movimientos.
 *
 * Un periodo bancario puede cruzar el cambio de mes (del 15 al 14), y entonces
 * no hay un mes «correcto», sino uno predominante. Empatados, gana el más
 * reciente, que es como se nombra el documento.
 */
export function pickPeriod(dates: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const date of dates) {
    if (!ISO_DATE.test(date)) {
      continue;
    }
    const month = date.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [month, count] of counts) {
    if (count > bestCount || (count === bestCount && month > best)) {
      best = month;
      bestCount = count;
    }
  }
  return best;
}

export interface StatementCsvSource {
  /** `jobId` del trabajo: identifica el estado de cuenta en el historial. */
  jobId: string;
  extractorId: string;
  /** Contenido del CSV de la hoja `Movimientos`. */
  movementsCsv: string;
  /** Contenido del CSV de la hoja `Resumen`, cuando el trabajo lo publicó. */
  summaryCsv: string | null;
  /** Se usa solo si el documento no trae ninguna fecha legible. */
  fallbackPeriod: string;
}

export function buildFinancialStatement(source: StatementCsvSource): FinancialStatement {
  const table = readCsvTable(source.movementsCsv);
  const rows = table.rows.map((row) => readMovementRow(table, row));
  const movementRows = rows.filter(isMovement);
  const summary = readSummary(source.summaryCsv);
  const bancoOrigen = bankFromExtractor(source.extractorId);
  const moneda = summary.moneda ?? UNDECLARED_CURRENCY;

  // El ITF sale de la cuenta igual que un cargo: sin sumarlo, saldo inicial más
  // entradas menos salidas no llegaría al saldo final que declara el banco.
  const sumaAbonos = movementRows.reduce((total, row) => total + row.creditCents, 0);
  const sumaCargos = movementRows.reduce((total, row) => total + row.debitCents + row.itfCents, 0);
  const abonos = summary.abonos ?? sumaAbonos;
  const cargos = summary.cargos === null ? sumaCargos : summary.cargos + (summary.itf ?? 0);

  // Orden de preferencia: lo que el documento declara, luego lo que se puede
  // derivar de sus saldos, y solo al final la ecuación del periodo.
  const previousBalanceRow = rows.find((row) => row.rowType === PREVIOUS_BALANCE_ROW_TYPE);
  const lastBalance = [...movementRows].reverse().find((row) => row.balanceCents !== null);
  const saldoFinal = summary.saldoFinal ?? lastBalance?.balanceCents ?? null;
  const saldoInicial =
    summary.saldoInicial ??
    previousBalanceRow?.balanceCents ??
    (saldoFinal === null ? 0 : saldoFinal - abonos + cargos);

  const movimientos: FinancialTransaction[] = [];
  let running = saldoInicial;
  movementRows.forEach((row, index) => {
    const netCents = row.creditCents - row.debitCents;
    const expected = running + netCents - row.itfCents;
    // El saldo impreso ya descuenta el ITF de la fila, así que la fila cuadra o
    // no cuadra entera: el movimiento y su ITF comparten la marca.
    const reconciled = row.balanceCents !== null && row.balanceCents === expected;
    const date = ISO_DATE.test(row.date) ? row.date : '';
    movimientos.push({
      id: `${source.jobId}-${String(index)}`,
      bankId: bancoOrigen,
      currency: moneda,
      date,
      description: row.description,
      category: inferCategory(row.description),
      type: netCents >= 0 ? 'ABONO' : 'CARGO',
      amountCents: Math.abs(netCents),
      reconciled,
    });
    if (row.itfCents !== 0) {
      // Aparte, como lo imprime el banco: el movimiento conserva su importe y el
      // impuesto se ve como el cargo que es.
      movimientos.push({
        id: `${source.jobId}-${String(index)}-itf`,
        bankId: bancoOrigen,
        currency: moneda,
        date,
        description: ITF_DESCRIPTION,
        category: inferCategory(ITF_DESCRIPTION),
        type: 'CARGO',
        amountCents: row.itfCents,
        reconciled,
      });
    }
    // Se sigue desde el saldo que declara la fila: un descuadre puntual no debe
    // marcar como dudosas todas las filas que vienen después.
    running = row.balanceCents ?? expected;
  });

  // Por fila del documento y no por movimiento mostrado: el ITF aparte contaría doble.
  const fechaPeriodo = pickPeriod(movementRows.map((row) => row.date)) || source.fallbackPeriod;

  return {
    id: source.jobId,
    bancoOrigen,
    moneda,
    fechaPeriodo,
    periodoLabel: getMonthLabel(fechaPeriodo),
    saldoInicial,
    abonos,
    cargos,
    saldoFinal: saldoFinal ?? saldoInicial + abonos - cargos,
    movimientos,
  };
}
