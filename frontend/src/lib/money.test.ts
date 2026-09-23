import { describe, expect, it } from 'vitest';

import { parseCents, parseCentsOrZero } from './money';

describe('parseCents', () => {
  it('convierte el decimal plano del CSV a centavos enteros', () => {
    expect(parseCents('1234.56')).toBe(123456);
    expect(parseCents('0.05')).toBe(5);
    expect(parseCents('1234')).toBe(123400);
    expect(parseCents('1234.5')).toBe(123450);
  });

  it('no arrastra el error de la coma flotante', () => {
    // `Number('1234.56') * 100` da 123455.99999999999.
    expect(parseCents('1234.56')).toBe(Math.trunc(parseCents('1234.56') ?? 0));
    let total = 0;
    for (let i = 0; i < 1000; i += 1) {
      total += parseCents('0.07') ?? 0;
    }
    expect(total).toBe(7000);
  });

  it('respeta el signo, que algunos bancos imprimen delante del importe', () => {
    expect(parseCents('-80.10')).toBe(-8010);
    expect(parseCents('+80.10')).toBe(8010);
  });

  it('redondea al alza un tercer decimal', () => {
    expect(parseCents('1.005')).toBe(101);
    expect(parseCents('-1.005')).toBe(-101);
    expect(parseCents('1.004')).toBe(100);
  });

  it('devuelve null para una celda vacía o ilegible, sin inventar un cero', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('  ')).toBeNull();
    expect(parseCents('1,234.56')).toBeNull();
    expect(parseCents('S/ 10')).toBeNull();
    expect(parseCents('1e3')).toBeNull();
  });
});

describe('parseCentsOrZero', () => {
  it('trata la celda ausente como cero', () => {
    expect(parseCentsOrZero('')).toBe(0);
    expect(parseCentsOrZero('3.50')).toBe(350);
  });
});
