import { describe, expect, it } from 'vitest';

import { buildCalendarCells, daysInMonth, getMonthLabel, shiftMonth } from './calendar-grid';

describe('shiftMonth', () => {
  it('avanza y retrocede meses, cruzando el fin de año', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('getMonthLabel', () => {
  it('capitaliza el nombre del mes en español', () => {
    expect(getMonthLabel('2026-09')).toBe('Setiembre de 2026');
  });
});

describe('daysInMonth', () => {
  it('cuenta los días del mes, incluyendo febrero bisiesto', () => {
    expect(daysInMonth('2026-09')).toBe(30);
    expect(daysInMonth('2024-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
  });
});

describe('buildCalendarCells', () => {
  it('rellena la cuadrícula a múltiplos de 7 y numera los días reales', () => {
    const cells = buildCalendarCells('2026-09');
    expect(cells.length % 7).toBe(0);

    const realDays = cells.filter((cell) => cell !== null);
    expect(realDays).toHaveLength(30);
    expect(realDays[0]).toEqual({ date: '2026-09-01', dayNumber: 1 });
    expect(realDays[29]).toEqual({ date: '2026-09-30', dayNumber: 30 });
  });
});
