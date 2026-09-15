import type { BankId } from '@/features/statements/bank-selector';

export type { BankId };

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
  bankId: BankId;
  date: string;
  description: string;
  category: string;
  type: MovementType;
  amountCents: number;
  reconciled: boolean;
}

/**
 * Un estado de cuenta (EECC) ya procesado: un banco, un periodo, y lo que trae
 * declarado — saldo inicial, saldo final y los movimientos de ese mes. Refleja
 * el shape con el que el worker de PDF entrega cada documento, para que
 * "preseleccionar del historial" tenga sentido con datos que se ven como los
 * reales, no solo una lista plana de movimientos.
 */
export interface FinancialStatement {
  id: string;
  bancoOrigen: BankId;
  fechaPeriodo: string;
  periodoLabel: string;
  saldoInicial: number;
  abonos: number;
  cargos: number;
  saldoFinal: number;
  movimientos: FinancialTransaction[];
}
