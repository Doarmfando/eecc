import type { SourceBankId } from './bank-accent';

export type { SourceBankId };

export type MovementType = 'ABONO' | 'CARGO';

/**
 * Movimiento consolidado para el Centro Financiero.
 *
 * `amountCents` guarda soles en centavos: es un entero, así la suma de miles de
 * filas nunca arrastra el error de redondio de la coma flotante. Solo se pasa a
 * decimal al formatear para mostrarlo.
 */
export interface FinancialTransaction {
  id: string;
  bankId: SourceBankId;
  date: string;
  description: string;
  category: string;
  type: MovementType;
  amountCents: number;
  /**
   * El saldo que declara el documento después de esta fila coincide con el que
   * resulta de arrastrar el saldo inicial. `false` también cuando el estado de
   * cuenta no trae columna de saldo: entonces no hay nada que comprobar.
   */
  reconciled: boolean;
}

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
  bancoOrigen: SourceBankId;
  fechaPeriodo: string;
  periodoLabel: string;
  saldoInicial: number;
  abonos: number;
  cargos: number;
  saldoFinal: number;
  movimientos: FinancialTransaction[];
}
