import type { BankId } from '@/features/statements/bank-selector';
import { getMonthLabel } from '@/lib/month';

import type { FinancialStatement, FinancialTransaction, MovementType } from './types';

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

/** Saldo inicial con el que arranca cada banco en el mes más antiguo simulado. */
function randomOpeningBalanceCents(random: () => number): number {
  return randomInt(1500, 8000, random) * 100;
}

/**
 * Genera un historial simulado de estados de cuenta (uno por banco y mes) de los
 * últimos {@link MONTHS_OF_HISTORY} meses.
 *
 * Recorre los meses del más antiguo al más reciente para poder arrastrar el saldo:
 * el `saldoFinal` de un mes es el `saldoInicial` del siguiente, igual que en un
 * EECC real. La semilla fija hace que dos llamadas con el mismo `seed` produzcan
 * exactamente la misma data: útil tanto para la demo (no "salta" al re-renderizar)
 * como para las pruebas.
 */
export function generateMockStatements(
  seed = 20260914,
  referenceDate: Date = new Date(),
): FinancialStatement[] {
  const random = mulberry32(seed);
  const statements: FinancialStatement[] = [];
  const runningBalance: Record<BankId, number> = {
    bcp: randomOpeningBalanceCents(random),
    bbva: randomOpeningBalanceCents(random),
    interbank: randomOpeningBalanceCents(random),
    scotiabank: randomOpeningBalanceCents(random),
  };

  for (let offset = MONTHS_OF_HISTORY - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - offset, 1);
    const year = monthDate.getFullYear();
    const monthIndex = monthDate.getMonth();
    const lastDay = daysInMonth(year, monthIndex);
    const fechaPeriodo = `${String(year)}-${String(monthIndex + 1).padStart(2, '0')}`;

    for (const bankId of BANK_IDS) {
      const movementsThisMonth = randomInt(9, 24, random);
      const movimientos: FinancialTransaction[] = [];
      let abonos = 0;
      let cargos = 0;

      for (let i = 0; i < movementsThisMonth; i += 1) {
        const template = pick(MOVEMENT_TEMPLATES, random);
        const day = randomInt(1, lastDay, random);
        const amountSoles = randomInt(template.minSoles, template.maxSoles, random);
        const amountCents = amountSoles * 100;
        const date = new Date(year, monthIndex, day);

        if (template.type === 'ABONO') {
          abonos += amountCents;
        } else {
          cargos += amountCents;
        }

        movimientos.push({
          id: `${bankId}-${String(year)}${String(monthIndex + 1).padStart(2, '0')}${String(day).padStart(2, '0')}-${String(i)}`,
          bankId,
          date: date.toISOString().slice(0, 10),
          description: template.description,
          category: template.category,
          type: template.type,
          amountCents,
          // Casi todo reconcilia: una demo 100% perfecta no distinguiría el
          // indicador de precisión de un valor fijo en la UI.
          reconciled: random() > 0.025,
        });
      }

      movimientos.sort((a, b) => b.date.localeCompare(a.date));

      const saldoInicial = runningBalance[bankId];
      const saldoFinal = saldoInicial + abonos - cargos;
      runningBalance[bankId] = saldoFinal;

      statements.push({
        id: `${bankId}-${fechaPeriodo}`,
        bancoOrigen: bankId,
        fechaPeriodo,
        periodoLabel: getMonthLabel(fechaPeriodo),
        saldoInicial,
        abonos,
        cargos,
        saldoFinal,
        movimientos,
      });
    }
  }

  return statements.sort(
    (a, b) =>
      b.fechaPeriodo.localeCompare(a.fechaPeriodo) || a.bancoOrigen.localeCompare(b.bancoOrigen),
  );
}

export const MOCK_STATEMENTS: readonly FinancialStatement[] = generateMockStatements();

export const MOCK_TRANSACTIONS: readonly FinancialTransaction[] = MOCK_STATEMENTS.flatMap(
  (statement) => statement.movimientos,
).sort((a, b) => b.date.localeCompare(a.date));

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
