import { describe, expect, it } from 'vitest';

import { formatBytes, formatCount, formatSoles } from './format';

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

describe('formatSoles', () => {
  it('convierte centavos enteros a soles con símbolo de moneda', () => {
    expect(formatSoles(0)).toContain('0.00');
    expect(formatSoles(150050)).toContain('1,500.50');
    expect(formatSoles(150050)).toContain('S/');
  });

  it('conserva el signo de un saldo negativo', () => {
    expect(formatSoles(-2500)).toContain('25.00');
    expect(formatSoles(-2500)).toMatch(/-/);
  });

  it('no inventa un valor cuando el dato es inválido', () => {
    expect(formatSoles(Number.NaN)).toBe('—');
  });
});
