import { describe, expect, it } from 'vitest';

import {
  daysInMonth,
  getMonthLabel,
  getMonthShortLabel,
  shiftMonth,
  toDateKey,
  toMonthKey,
} from './month';

describe('shiftMonth', () => {
  it('avanza y retrocede meses, cruzando el fin de año', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('toMonthKey', () => {
  it('formatea una fecha como "aaaa-mm"', () => {
    expect(toMonthKey(new Date(2026, 8, 14))).toBe('2026-09');
    expect(toMonthKey(new Date(2026, 0, 1))).toBe('2026-01');
  });
});

describe('toDateKey', () => {
  it('formatea una fecha local como "aaaa-mm-dd"', () => {
    expect(toDateKey(new Date(2026, 8, 4))).toBe('2026-09-04');
    expect(toDateKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('getMonthLabel', () => {
  it('capitaliza el nombre completo del mes en español', () => {
    expect(getMonthLabel('2026-09')).toBe('Setiembre de 2026');
  });
});

describe('getMonthShortLabel', () => {
  it('capitaliza el nombre corto del mes en español', () => {
    expect(getMonthShortLabel('2026-09')).toMatch(/^Set\.? 2026$/);
  });
});

describe('daysInMonth', () => {
  it('cuenta los días del mes, incluyendo febrero bisiesto', () => {
    expect(daysInMonth('2026-09')).toBe(30);
    expect(daysInMonth('2024-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
  });
});
