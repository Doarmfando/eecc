import { describe, expect, it } from 'vitest';

import { centsToPriceInput, parseCents, parseCentsOrZero, parsePriceInput } from './money';

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

describe('parsePriceInput', () => {
  it('lee punto o coma decimal y completa los céntimos', () => {
    expect(parsePriceInput('19.90')).toBe(1990);
    expect(parsePriceInput('19,9')).toBe(1990);
    expect(parsePriceInput(' 20 ')).toBe(2000);
    expect(parsePriceInput('0.15')).toBe(15);
    expect(parsePriceInput('0')).toBe(0);
    expect(parsePriceInput('999999.99')).toBe(99_999_999);
  });

  it('rechaza lo que no es un precio en vez de adivinar', () => {
    expect(parsePriceInput('')).toBeNull();
    expect(parsePriceInput('-5')).toBeNull();
    expect(parsePriceInput('1.005')).toBeNull();
    expect(parsePriceInput('1.000,50')).toBeNull();
    expect(parsePriceInput('S/ 20')).toBeNull();
    expect(parsePriceInput('1000000')).toBeNull();
  });
});

describe('centsToPriceInput', () => {
  it('escribe siempre dos decimales, sin coma flotante', () => {
    expect(centsToPriceInput(1990)).toBe('19.90');
    expect(centsToPriceInput(15)).toBe('0.15');
    expect(centsToPriceInput(0)).toBe('0.00');
    expect(parsePriceInput(centsToPriceInput(8990))).toBe(8990);
  });
});
