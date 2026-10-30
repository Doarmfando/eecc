import type { Currency } from '@/lib/format';

import type { SourceBankId } from './bank-accent';

export type { SourceBankId };

export type MovementType = 'ABONO' | 'CARGO';

/** Familia de la cuenta según el producto que imprime el banco (`CONTIAHORRO` es ahorro). */
export type AccountType = 'AHORRO' | 'CORRIENTE';

/**
 * Qué fecha imprime el banco como principal. No significan lo mismo: BCP publica
 * la de proceso y BBVA la de operación; Interbank, Banco de la Nación y el
 * respaldo genérico rotulan solo «Fecha», sin decir cuál es.
 */
export type DateKind = 'PROCESO' | 'OPERACION' | 'NO_DECLARADA';

/**
 * Algo del movimiento que no cuadra en el propio CSV. No se corrige en silencio:
 * se conserva el importe de las columnas `Cargo` y `Abono` y se señala.
 *
 * - `SIGNO_INCONSISTENTE`: `Cargo/Abono` no es abono menos cargo.
 * - `IMPORTE_NEGATIVO`: `Cargo` o `Abono` trae signo; se muestra su magnitud.
 */
export type MovementIssue = 'SIGNO_INCONSISTENTE' | 'IMPORTE_NEGATIVO';

/** Dónde está la fila en la hoja `Movimientos` del documento. */
export interface MovementSource {
  /** La página del PDF, si la hoja la publica. */
  page: number | null;
  /** Posición de la fila entre las de datos de la hoja, desde 1. */
  row: number;
}

/**
 * Movimiento consolidado para el Centro Financiero.
 *
 * Todos los importes van en centavos de `currency`: son enteros, así la suma de
 * miles de filas nunca arrastra el error de redondeo de la coma flotante. Solo
 * se pasan a decimal al formatear para mostrarlos.
 */
export interface FinancialTransaction {
  id: string;
  /** El `jobId` del documento de donde sale la fila. */
  statementId: string;
  bankId: SourceBankId;
  currency: Currency;
  /** La fecha principal que imprime el banco; su significado lo da `FinancialStatement.tipoFecha`. */
  date: string;
  /** Fecha valor, solo si el banco la imprime. */
  valueDate: string | null;
  description: string;
  /** Deducida del texto: es una ayuda de lectura, no un dato del banco. */
  category: string;
  /** Signo del neto (`abono − cargo`): el que manda en flujos y calendario. */
  type: MovementType;
  /** Valor absoluto del neto. */
  amountCents: number;
  /** Lo que trae la columna `Cargo`, sin signo; 0 si está vacía. */
  debitCents: number;
  /** Lo que trae la columna `Abono`, sin signo; 0 si está vacía. */
  creditCents: number;
  /**
   * El saldo que imprime el documento después de la fila. Nunca se calcula: si
   * el banco no lo imprime, `null`. Con ITF aparte, lo lleva la fila del ITF,
   * que es la que deja la cuenta en ese saldo.
   */
  balanceCents: number | null;
  /**
   * El saldo que declara el documento después de esta fila coincide con el que
   * resulta de arrastrar el saldo inicial. `false` también cuando el estado de
   * cuenta no trae columna de saldo: entonces no hay nada que comprobar.
   */
  reconciled: boolean;
  /** La fecha cae fuera del periodo que declara el documento (un cargo tardío, por ejemplo). */
  outsidePeriod: boolean;
  issues: readonly MovementIssue[];
  source: MovementSource;
}

/** Abono en positivo y cargo en negativo, como la columna `Cargo/Abono`. */
export function signedCents(transaction: FinancialTransaction): number {
  return transaction.creditCents - transaction.debitCents;
}

/**
 * La cuenta que declara la hoja `Encabezado`.
 *
 * El número completo nunca se guarda: `clave` es una huella suya y
 * `terminacion`, sus cuatro últimos caracteres, lo único que se muestra.
 */
export interface StatementAccount {
  clave: string;
  terminacion: string;
}

/** Periodo `DEL … AL …` que imprime el banco, en fechas ISO. */
export interface DeclaredPeriod {
  start: string;
  end: string;
}

/** Estado con el que terminó la conversión: solo estos dejan archivos que leer. */
export type StatementStatus = 'SUCCEEDED' | 'NEEDS_REVIEW';

/**
 * Un estado de cuenta (EECC) ya procesado: un banco, un periodo, y lo que trae
 * declarado — saldo inicial, saldo final y los movimientos de ese mes.
 *
 * Se arma en el navegador leyendo los CSV que el worker ya publicó para ese
 * trabajo; no hay tabla de movimientos en la base de datos. Ver `ADR-0010`.
 */
export interface FinancialStatement {
  /** El `jobId` del trabajo que lo produjo: es lo que lo identifica en el historial. */
  id: string;
  /** Nombre del PDF que subió la persona, si se conoce. Etiqueta privada. */
  nombreDocumento: string | null;
  estado: StatementStatus | null;
  /** Versión del extractor que lo convirtió; permite saber si es anterior a un arreglo. */
  versionExtractor: string | null;
  bancoOrigen: SourceBankId;
  /** La moneda de la cuenta: todos los importes del documento están en ella. */
  moneda: Currency;
  /** `false` cuando el documento no la declara y se supone soles. */
  monedaDeclarada: boolean;
  /** `null` si el documento no publica `Encabezado` o no trae número de cuenta. */
  cuenta: StatementAccount | null;
  /**
   * Ahorro o corriente, cuando el `Resumen` lo declara. Hoy solo lo lee BBVA de
   * la cabecera; en los demás bancos queda sin definir en vez de suponerse.
   */
  tipoCuenta?: AccountType;
  tipoFecha: DateKind;
  /** Mes del documento: donde cae la mayoría de sus movimientos. */
  fechaPeriodo: string;
  periodoLabel: string;
  /** El periodo que imprime el banco, si lo publica (`Encabezado`). */
  periodoDeclarado: DeclaredPeriod | null;
  saldoInicial: number;
  abonos: number;
  cargos: number;
  saldoFinal: number;
  movimientos: FinancialTransaction[];
}
