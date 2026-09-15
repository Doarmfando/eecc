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
