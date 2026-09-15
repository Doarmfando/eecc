import { describe, expect, it } from 'vitest';

import { generateMockStatements, MOCK_MONTH_RANGE, MOCK_TRANSACTIONS } from './mock-transactions';

const REFERENCE_DATE = new Date('2026-09-14T00:00:00.000Z');

describe('generateMockStatements', () => {
  it('es determinista para una misma semilla', () => {
    const first = generateMockStatements(1, REFERENCE_DATE);
    const second = generateMockStatements(1, REFERENCE_DATE);
    expect(second).toEqual(first);
  });

  it('produce data distinta con otra semilla', () => {
    const first = generateMockStatements(1, REFERENCE_DATE);
    const other = generateMockStatements(2, REFERENCE_DATE);
    expect(other).not.toEqual(first);
  });

  it('genera un estado de cuenta por banco y mes, doce meses hacia atrás', () => {
    const statements = generateMockStatements(7, REFERENCE_DATE);
    expect(statements).toHaveLength(4 * 12);

    const bankIds = new Set(statements.map((statement) => statement.bancoOrigen));
    expect(bankIds).toEqual(new Set(['bcp', 'bbva', 'interbank', 'scotiabank']));

    const periods = new Set(statements.map((statement) => statement.fechaPeriodo));
    expect(periods.size).toBe(12);
  });

  it('el saldo final de cada EECC cuadra con inicial + abonos - cargos', () => {
    const statements = generateMockStatements(7, REFERENCE_DATE);
    for (const statement of statements) {
      expect(statement.saldoFinal).toBe(
        statement.saldoInicial + statement.abonos - statement.cargos,
      );

      const sumaAbonos = statement.movimientos
        .filter((m) => m.type === 'ABONO')
        .reduce((total, m) => total + m.amountCents, 0);
      const sumaCargos = statement.movimientos
        .filter((m) => m.type === 'CARGO')
        .reduce((total, m) => total + m.amountCents, 0);
      expect(statement.abonos).toBe(sumaAbonos);
      expect(statement.cargos).toBe(sumaCargos);
    }
  });

  it('arrastra el saldo final de un mes como saldo inicial del siguiente, por banco', () => {
    const statements = generateMockStatements(7, REFERENCE_DATE);
    const porBanco = statements
      .filter((statement) => statement.bancoOrigen === 'bcp')
      .sort((a, b) => a.fechaPeriodo.localeCompare(b.fechaPeriodo));

    for (let i = 1; i < porBanco.length; i += 1) {
      expect(porBanco[i]?.saldoInicial).toBe(porBanco[i - 1]?.saldoFinal);
    }
  });

  it('los movimientos de cada EECC están en centavos enteros y positivos', () => {
    const statements = generateMockStatements(7, REFERENCE_DATE);
    for (const statement of statements) {
      for (const movimiento of statement.movimientos) {
        expect(Number.isInteger(movimiento.amountCents)).toBe(true);
        expect(movimiento.amountCents).toBeGreaterThan(0);
      }
    }
  });
});

describe('MOCK_TRANSACTIONS', () => {
  it('aplana los movimientos de todos los EECC, del más reciente al más antiguo', () => {
    expect(MOCK_TRANSACTIONS.length).toBeGreaterThan(300);
    for (let i = 1; i < MOCK_TRANSACTIONS.length; i += 1) {
      const current = MOCK_TRANSACTIONS[i]?.date ?? '';
      const previous = MOCK_TRANSACTIONS[i - 1]?.date ?? '';
      expect(current <= previous).toBe(true);
    }
  });
});

describe('MOCK_MONTH_RANGE', () => {
  it('cubre un rango de meses no vacío', () => {
    expect(MOCK_MONTH_RANGE.min <= MOCK_MONTH_RANGE.max).toBe(true);
    expect(MOCK_MONTH_RANGE.min).not.toBe('');
  });
});
