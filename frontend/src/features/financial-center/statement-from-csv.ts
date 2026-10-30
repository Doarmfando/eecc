import { findColumn, readCell, readCsvTable, type CsvTable } from '@/lib/csv';
import type { Currency } from '@/lib/format';
import { parseCents } from '@/lib/money';
import { getMonthLabel } from '@/lib/month';
import type { Artifact } from '@/types/job';

import { readAccountHeader } from './account-header';
import { bankFromExtractor } from './bank-accent';
import type {
  AccountType,
  DateKind,
  FinancialStatement,
  FinancialTransaction,
  MovementIssue,
  StatementStatus,
} from './types';

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

/**
 * `Tipo de fila` lo traen todos los bancos (`MOVIMIENTO`, `SALDO_ANTERIOR`, totales,
 * saldos…), cuyas hojas incluyen esas filas junto a los movimientos. Los Excel BCP
 * anteriores a ADR-0015 lo escribían en inglés (`MOVEMENT`, `PREVIOUS_BALANCE`), y los
 * de otros bancos no lo traían; se siguen leyendo.
 */
const MOVEMENT_ROW_TYPES: ReadonlySet<string> = new Set(['MOVEMENT', 'MOVIMIENTO']);
const PREVIOUS_BALANCE_ROW_TYPES: ReadonlySet<string> = new Set([
  'PREVIOUS_BALANCE',
  'SALDO_ANTERIOR',
]);

interface MovementRow {
  /** Posición entre las filas de datos de la hoja, desde 1. */
  index: number;
  page: number | null;
  rowType: string;
  date: string;
  valueDate: string;
  description: string;
  debitCents: number;
  creditCents: number;
  /** Impuesto a las Transacciones Financieras que el BBVA imprime aparte; 0 si no hay. */
  itfCents: number;
  balanceCents: number | null;
  issues: MovementIssue[];
}

/** Cómo se muestra el ITF cuando el banco lo cobra en columna propia. */
export const ITF_DESCRIPTION = 'ITF';

/** Rótulos de la fecha principal de cada exportador y lo que significan. */
const DATE_COLUMNS: readonly (readonly [string, DateKind])[] = [
  ['Fecha proceso', 'PROCESO'],
  ['Fecha oper.', 'OPERACION'],
  ['Fecha', 'NO_DECLARADA'],
];
const DEBIT_COLUMNS = ['Cargo', 'Cargos', 'Gastos'] as const;
const CREDIT_COLUMNS = ['Abono', 'Abonos', 'Ingresos'] as const;

function readDateKind(table: CsvTable): DateKind {
  const column = findColumn(table, ...DATE_COLUMNS.map(([header]) => header));
  return DATE_COLUMNS.find(([header]) => header === column)?.[1] ?? 'NO_DECLARADA';
}

/**
 * Cargo y abono de la fila, por separado.
 *
 * Hoy todos los bancos publican la columna con signo `Cargo/Abono` junto a sus
 * columnas `Cargo` y `Abono` (ADR-0013); los Excel BBVA anteriores solo la con
 * signo. Si están las separadas, mandan ellas — son las que imprime el banco
 * salvo en BBVA, donde se derivan de la firmada — y la firmada se usa para
 * comprobarlas. Lo que no cuadra no se corrige: se señala.
 */
function readAmounts(
  table: CsvTable,
  row: readonly string[],
  hasSplitColumns: boolean,
): { debitCents: number; creditCents: number; issues: MovementIssue[] } {
  const signed = parseCents(readCell(table, row, 'Cargo/Abono'));
  if (!hasSplitColumns) {
    return {
      debitCents: signed === null ? 0 : Math.max(-signed, 0),
      creditCents: signed === null ? 0 : Math.max(signed, 0),
      issues: [],
    };
  }
  const debit = parseCents(readCell(table, row, ...DEBIT_COLUMNS)) ?? 0;
  const credit = parseCents(readCell(table, row, ...CREDIT_COLUMNS)) ?? 0;
  const debitCents = Math.abs(debit);
  const creditCents = Math.abs(credit);
  const issues: MovementIssue[] = [];
  if (debit < 0 || credit < 0) {
    issues.push('IMPORTE_NEGATIVO');
  }
  if (signed !== null && signed !== creditCents - debitCents) {
    issues.push('SIGNO_INCONSISTENTE');
  }
  return { debitCents, creditCents, issues };
}

function readMovementRow(
  table: CsvTable,
  row: readonly string[],
  index: number,
  hasSplitColumns: boolean,
): MovementRow {
  const page = Number.parseInt(readCell(table, row, 'Página'), 10);
  return {
    index: index + 1,
    page: Number.isSafeInteger(page) && page > 0 ? page : null,
    rowType: readCell(table, row, 'Tipo de fila').trim(),
    date: readCell(table, row, ...DATE_COLUMNS.map(([header]) => header)).trim(),
    valueDate: readCell(table, row, 'Fecha valor').trim(),
    description: readCell(table, row, 'Descripción', 'Concepto').trim(),
    ...readAmounts(table, row, hasSplitColumns),
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
    return MOVEMENT_ROW_TYPES.has(row.rowType);
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

export interface DeclaredSummary {
  /** `Archivo`: el nombre del PDF que el trabajo escribe al publicar. */
  archivo: string | null;
  moneda: Currency | null;
  tipoCuenta: AccountType | null;
  saldoInicial: number | null;
  abonos: number | null;
  cargos: number | null;
  saldoFinal: number | null;
}

const CURRENCIES: ReadonlySet<string> = new Set<Currency>(['PEN', 'USD']);
const ACCOUNT_TYPES: ReadonlySet<string> = new Set<AccountType>(['AHORRO', 'CORRIENTE']);

function readCurrency(raw: string): Currency | null {
  const code = raw.trim().toUpperCase();
  return CURRENCIES.has(code) ? (code as Currency) : null;
}

/** Lo declaran los extractores que leen la cabecera del documento; el genérico, no. */
function readAccountType(raw: string): AccountType | null {
  const code = raw.trim().toUpperCase();
  return ACCOUNT_TYPES.has(code) ? (code as AccountType) : null;
}

/**
 * El CSV de una hoja concreta del resultado.
 *
 * El nombre lo generó el sistema (`statement_Movimientos.csv`), nunca el archivo
 * que subió la persona; es el mismo criterio que usa `describeArtifact`.
 */
export function findSheetCsv(artifacts: readonly Artifact[], sheet: string): Artifact | undefined {
  return artifacts.find(
    (artifact) => artifact.kind === 'RESULT_CSV' && artifact.name.endsWith(`_${sheet}.csv`),
  );
}

/** Lee la hoja `Resumen`, que no todos los extractores llenan igual. */
export function readSummary(csv: string | null): DeclaredSummary {
  const empty: DeclaredSummary = {
    archivo: null,
    moneda: null,
    tipoCuenta: null,
    saldoInicial: null,
    abonos: null,
    cargos: null,
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
    archivo: readCell(table, row, 'Archivo').trim() || null,
    moneda: readCurrency(readCell(table, row, 'Moneda')),
    tipoCuenta: readAccountType(readCell(table, row, 'Tipo de cuenta')),
    saldoInicial: parseCents(readCell(table, row, 'Saldo inicial', 'Saldo anterior')),
    abonos: parseCents(readCell(table, row, 'Total abonos', 'Total ingresos')),
    cargos: parseCents(readCell(table, row, 'Total cargos', 'Total gastos')),
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
  /** Contenido del CSV de la hoja `Encabezado`; los documentos anteriores a ADR-0012 no la tienen. */
  headerCsv?: string | null;
  /** El nombre que el historial muestra para el documento. */
  documentName?: string | null;
  status?: StatementStatus | null;
  extractorVersion?: string | null;
}

export function buildFinancialStatement(source: StatementCsvSource): FinancialStatement {
  const table = readCsvTable(source.movementsCsv);
  const hasSplitColumns =
    findColumn(table, ...DEBIT_COLUMNS) !== null || findColumn(table, ...CREDIT_COLUMNS) !== null;
  const rows = table.rows.map((row, index) => readMovementRow(table, row, index, hasSplitColumns));
  const movementRows = rows.filter(isMovement);
  const summary = readSummary(source.summaryCsv);
  const header = readAccountHeader(source.headerCsv ?? null);
  const bancoOrigen = bankFromExtractor(source.extractorId);
  const moneda = summary.moneda ?? UNDECLARED_CURRENCY;
  const periodo = header.periodo;

  // El ITF sale de la cuenta igual que un cargo, y aquí se muestra aparte.
  const sumaAbonos = movementRows.reduce((total, row) => total + row.creditCents, 0);
  const sumaCargos = movementRows.reduce((total, row) => total + row.debitCents + row.itfCents, 0);
  // El BBVA no imprime totales de cargos y abonos: los calcula el worker. Hoy los
  // publica brutos con el ITF aparte (ADR-0013); los Excel anteriores mezclaban
  // el ITF en ellos. Como aquí el ITF es un cargo propio, entradas y salidas se
  // suman desde las mismas filas que se listan: así da igual qué versión del
  // `Resumen` se lea y el ITF nunca cuenta dos veces.
  const itfPorFila = movementRows.some((row) => row.itfCents !== 0);
  const abonos = itfPorFila ? sumaAbonos : (summary.abonos ?? sumaAbonos);
  const cargos = itfPorFila ? sumaCargos : (summary.cargos ?? sumaCargos);

  // Orden de preferencia: lo que el documento declara, luego lo que se puede
  // derivar de sus saldos, y solo al final la ecuación del periodo.
  const previousBalanceRow = rows.find((row) => PREVIOUS_BALANCE_ROW_TYPES.has(row.rowType));
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
    const common = {
      statementId: source.jobId,
      bankId: bancoOrigen,
      currency: moneda,
      date,
      valueDate: ISO_DATE.test(row.valueDate) ? row.valueDate : null,
      reconciled,
      outsidePeriod:
        periodo !== null && date !== '' && (date < periodo.start || date > periodo.end),
      issues: row.issues,
      source: { page: row.page, row: row.index },
    };
    const hasItf = row.itfCents !== 0;
    movimientos.push({
      ...common,
      id: `${source.jobId}-${String(index)}`,
      description: row.description,
      category: inferCategory(row.description),
      type: netCents >= 0 ? 'ABONO' : 'CARGO',
      amountCents: Math.abs(netCents),
      debitCents: row.debitCents,
      creditCents: row.creditCents,
      // El saldo impreso ya descuenta el ITF: lo lleva la fila del ITF, que va después.
      balanceCents: hasItf ? null : row.balanceCents,
    });
    if (hasItf) {
      // Aparte, como lo imprime el banco: el movimiento conserva su importe y el
      // impuesto se ve como el cargo que es.
      movimientos.push({
        ...common,
        id: `${source.jobId}-${String(index)}-itf`,
        description: ITF_DESCRIPTION,
        category: inferCategory(ITF_DESCRIPTION),
        type: 'CARGO',
        amountCents: row.itfCents,
        debitCents: row.itfCents,
        creditCents: 0,
        balanceCents: row.balanceCents,
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
    nombreDocumento: source.documentName ?? summary.archivo,
    estado: source.status ?? null,
    versionExtractor: source.extractorVersion ?? null,
    bancoOrigen,
    moneda,
    monedaDeclarada: summary.moneda !== null,
    cuenta: header.cuenta,
    ...(summary.tipoCuenta ? { tipoCuenta: summary.tipoCuenta } : {}),
    tipoFecha: readDateKind(table),
    fechaPeriodo,
    periodoLabel: getMonthLabel(fechaPeriodo),
    periodoDeclarado: periodo,
    saldoInicial,
    abonos,
    cargos,
    saldoFinal: saldoFinal ?? saldoInicial + abonos - cargos,
    movimientos,
  };
}
