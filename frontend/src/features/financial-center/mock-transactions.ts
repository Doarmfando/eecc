import type { BankId } from '@/features/statements/bank-selector';

import type { FinancialTransaction, MovementType } from './types';

const BANK_IDS: readonly BankId[] = ['bcp', 'bbva', 'interbank', 'scotiabank'];

/** Meses de historial simulados hacia atrás desde el mes en curso. */
const MONTHS_OF_HISTORY = 12;

interface MovementTemplate {
  description: string;
  category: string;
  type: MovementType;
  minSoles: number;
  maxSoles: number;
}

const MOVEMENT_TEMPLATES: readonly MovementTemplate[] = [
  {
    description: 'Transferencia recibida — Cliente corporativo',
    category: 'Transferencias',
    type: 'ABONO',
    minSoles: 800,
    maxSoles: 25000,
  },
  {
    description: 'Cobro de venta — POS',
    category: 'Ventas',
    type: 'ABONO',
    minSoles: 50,
    maxSoles: 3200,
  },
  {
    description: 'Depósito en efectivo',
    category: 'Depósitos',
    type: 'ABONO',
    minSoles: 200,
    maxSoles: 6000,
  },
  {
    description: 'Interés ganado — Cuenta de ahorro',
    category: 'Rendimientos',
    type: 'ABONO',
    minSoles: 5,
    maxSoles: 180,
  },
  {
    description: 'Transferencia recibida — Reembolso',
    category: 'Transferencias',
    type: 'ABONO',
    minSoles: 100,
    maxSoles: 4500,
  },
  {
    description: 'Pago SUNAT — Tributos',
    category: 'Impuestos',
    type: 'CARGO',
    minSoles: 300,
    maxSoles: 18000,
  },
  {
    description: 'Pago de nómina — Planilla mensual',
    category: 'Nómina',
    type: 'CARGO',
    minSoles: 3000,
    maxSoles: 42000,
  },
  {
    description: 'Transferencia enviada — Proveedor',
    category: 'Proveedores',
    type: 'CARGO',
    minSoles: 500,
    maxSoles: 30000,
  },
  {
    description: 'Pago de servicios — Luz y agua',
    category: 'Servicios',
    type: 'CARGO',
    minSoles: 80,
    maxSoles: 950,
  },
  {
    description: 'Pago de servicios — Internet y telefonía',
    category: 'Servicios',
    type: 'CARGO',
    minSoles: 60,
    maxSoles: 500,
  },
  {
    description: 'Comisión de mantenimiento de cuenta',
    category: 'Comisiones',
    type: 'CARGO',
    minSoles: 8,
    maxSoles: 45,
  },
  {
    description: 'ITF — Impuesto a transacciones financieras',
    category: 'Impuestos',
    type: 'CARGO',
    minSoles: 1,
    maxSoles: 25,
  },
  {
    description: 'Pago a proveedor — Insumos y materiales',
    category: 'Proveedores',
    type: 'CARGO',
    minSoles: 400,
    maxSoles: 12000,
  },
  {
    description: 'Retiro en cajero automático',
    category: 'Retiros',
    type: 'CARGO',
    minSoles: 50,
    maxSoles: 1500,
  },
  {
    description: 'Pago de alquiler — Local comercial',
    category: 'Alquileres',
    type: 'CARGO',
    minSoles: 1200,
    maxSoles: 9000,
  },
];

/** Generador pseudoaleatorio con semilla fija: la data mockeada es estable entre renders. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) {
    throw new Error('No se puede elegir un elemento de una lista vacía.');
  }
  return item;
}

function randomInt(min: number, max: number, random: () => number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Genera un historial simulado de movimientos consolidados de los últimos
 * {@link MONTHS_OF_HISTORY} meses, repartidos entre los cuatro bancos.
 *
 * La semilla fija hace que dos llamadas con el mismo `seed` produzcan
 * exactamente la misma data: útil tanto para la demo (no "salta" al re-renderizar)
 * como para las pruebas.
 */
export function generateMockTransactions(
  seed = 20260914,
  referenceDate: Date = new Date(),
): FinancialTransaction[] {
  const random = mulberry32(seed);
  const transactions: FinancialTransaction[] = [];

  for (let offset = MONTHS_OF_HISTORY - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - offset, 1);
    const year = monthDate.getFullYear();
    const monthIndex = monthDate.getMonth();
    const lastDay = daysInMonth(year, monthIndex);

    for (const bankId of BANK_IDS) {
      const movementsThisMonth = randomInt(9, 24, random);

      for (let i = 0; i < movementsThisMonth; i += 1) {
        const template = pick(MOVEMENT_TEMPLATES, random);
        const day = randomInt(1, lastDay, random);
        const amountSoles = randomInt(template.minSoles, template.maxSoles, random);
        const date = new Date(year, monthIndex, day);

        transactions.push({
          id: `${bankId}-${String(year)}${String(monthIndex + 1).padStart(2, '0')}${String(day).padStart(2, '0')}-${String(i)}`,
          bankId,
          date: date.toISOString().slice(0, 10),
          description: template.description,
          category: template.category,
          type: template.type,
          amountCents: amountSoles * 100,
          // Casi todo reconcilia: una demo 100% perfecta no distinguiría el
          // indicador de precisión de un valor fijo en la UI.
          reconciled: random() > 0.025,
        });
      }
    }
  }

  return transactions.sort((a, b) => b.date.localeCompare(a.date));
}

export const MOCK_TRANSACTIONS: readonly FinancialTransaction[] = generateMockTransactions();

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function computeMonthRange(transactions: readonly FinancialTransaction[]): {
  min: string;
  max: string;
} {
  const keys = transactions.map((transaction) => monthKey(transaction.date)).sort();
  return { min: keys.at(0) ?? '', max: keys.at(-1) ?? '' };
}

export const MOCK_MONTH_RANGE: { min: string; max: string } = computeMonthRange(MOCK_TRANSACTIONS);
