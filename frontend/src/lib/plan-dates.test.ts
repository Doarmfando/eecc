import { describe, expect, it } from 'vitest';

import {
  describirVigencia,
  diasHasta,
  estadoDeVigencia,
  formatearDia,
  hoyLocal,
  sumarMeses,
} from './plan-dates';

describe('fechas de vigencia', () => {
  it('suma meses sin pasarse de mes', () => {
    expect(sumarMeses('2026-10-20', 1)).toBe('2026-11-20');
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMeses('2028-01-31', 1)).toBe('2028-02-29');
    expect(sumarMeses('2026-11-15', 12)).toBe('2027-11-15');
  });

  it('cuenta los días hasta el vencimiento', () => {
    expect(diasHasta('2026-10-27', '2026-10-20')).toBe(7);
    expect(diasHasta('2026-10-19', '2026-10-20')).toBe(-1);
  });

  it('hoy local en formato ISO', () => {
    expect(hoyLocal(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05');
  });

  it('formatea el día sin correrlo por la zona horaria', () => {
    expect(formatearDia('2026-11-20')).toMatch(/20/);
    expect(formatearDia('2026-11-20')).toMatch(/2026/);
  });

  it('clasifica la vigencia y avisa desde siete días antes', () => {
    const hoy = '2026-10-20';
    expect(estadoDeVigencia(null, hoy)).toBe('sin-vencimiento');
    expect(estadoDeVigencia('2026-12-20', hoy)).toBe('vigente');
    expect(estadoDeVigencia('2026-10-27', hoy)).toBe('por-vencer');
    expect(estadoDeVigencia('2026-10-19', hoy)).toBe('vencida');
    // La API cuenta con el día del negocio: si dice vencida, lo está.
    expect(estadoDeVigencia('2026-10-20', hoy, true)).toBe('vencida');
  });

  it('lo describe en palabras', () => {
    const hoy = '2026-10-20';
    expect(describirVigencia('2026-10-20', hoy)).toBe('Vence hoy');
    expect(describirVigencia('2026-10-21', hoy)).toBe('Vence mañana');
    expect(describirVigencia('2026-10-25', hoy)).toBe('Vence en 5 días');
    expect(describirVigencia('2026-12-20', hoy)).toMatch(/^Vence el /);
    expect(describirVigencia('2026-10-10', hoy)).toMatch(/^Venció el /);
  });
});
