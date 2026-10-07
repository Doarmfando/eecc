import { describe, expect, it } from 'vitest';

import { formatBytes, formatCount, formatMoney } from './format';

describe('formatBytes', () => {
  it('escala hasta la unidad legible más cercana', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('no inventa un valor cuando el dato es inválido', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });
});

describe('formatCount', () => {
  it('agrupa millares sin cambiar el valor', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1234)).toContain('234');
  });
});

describe('formatMoney', () => {
  it('convierte centavos enteros al importe con el símbolo de su moneda', () => {
    expect(formatMoney(0, 'PEN')).toBe('S/ 0.00');
    expect(formatMoney(150050, 'PEN')).toBe('S/ 1,500.50');
    expect(formatMoney(150050, 'USD')).toBe('US$ 1,500.50');
  });

  it('pone el signo delante del símbolo', () => {
    expect(formatMoney(-1549, 'PEN')).toBe('-S/ 15.49');
    expect(formatMoney(-123456789, 'USD')).toBe('-US$ 1,234,567.89');
  });

  it('no inventa un importe cuando el dato es inválido', () => {
    expect(formatMoney(Number.NaN, 'USD')).toBe('—');
  });
});
