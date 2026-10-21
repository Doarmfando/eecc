import { describe, expect, it } from 'vitest';

import { describirAviso, nombrarPaginas } from '@/components/shared/warning-labels';
import type { DeclaredSummary } from '@/features/financial-center/statement-from-csv';

import { diferenciaDeSaldo, esDescuadre, motivosDeRevision, pideRevision } from './review-result';

const RESUMEN: DeclaredSummary = {
  moneda: 'PEN',
  tipoCuenta: null,
  saldoInicial: 100_000,
  abonos: 50_000,
  cargos: 30_000,
  // Cifras ficticias: el banco imprime 50,00 más que lo que suman los movimientos.
  saldoFinal: 125_000,
};

describe('nombrarPaginas', () => {
  it('nombra una, dos o varias páginas como se diría', () => {
    expect(nombrarPaginas([424])).toBe('la página 424');
    expect(nombrarPaginas([3, 7])).toBe('las páginas 3 y 7');
    expect(nombrarPaginas([3, 7, 9])).toBe('las páginas 3, 7 y 9');
  });
});

describe('describirAviso', () => {
  it('dice en qué página faltan movimientos cuando el extractor lo sabe', () => {
    expect(describirAviso('BCP_PAGE_INCOMPLETE', [424])).toMatch(
      /^La página 424 trae bastantes menos movimientos que las demás/,
    );
    expect(describirAviso('BCP_PAGE_INCOMPLETE', [3, 7])).toMatch(/^Las páginas 3 y 7 traen/);
    // Una API anterior no manda la página: la frase no inventa ninguna.
    expect(describirAviso('BCP_PAGE_INCOMPLETE')).toMatch(/^Una página trae/);
  });

  it('explica el descuadre de saldo y deja un genérico para lo desconocido', () => {
    expect(describirAviso('BCP_BALANCE_MISMATCH')).toMatch(/saldo final que imprime el banco/);
    expect(describirAviso('BCP_CODIGO_NUEVO')).toBe('Advertencia del extractor.');
  });
});

describe('pideRevision', () => {
  it('solo un resultado con discrepancias que sí publicó archivos', () => {
    const archivo = [{ id: 'a', kind: 'RESULT_XLSX', byteSize: 1, name: 'statement.xlsx' }];
    expect(pideRevision({ status: 'NEEDS_REVIEW', artifacts: archivo })).toBe(true);
    expect(pideRevision({ status: 'SUCCEEDED', artifacts: archivo })).toBe(false);
    expect(pideRevision({ status: 'NEEDS_REVIEW', artifacts: [] })).toBe(false);
    expect(pideRevision({ status: 'FAILED', artifacts: [] })).toBe(false);
  });
});

describe('motivosDeRevision', () => {
  it('empieza por dónde mirar y luego el porqué', () => {
    const motivos = motivosDeRevision({
      warningCodes: ['BCP_DECLARED_TOTAL_MISMATCH', 'BCP_BALANCE_MISMATCH', 'BCP_PAGE_INCOMPLETE'],
      warningPages: [{ code: 'BCP_PAGE_INCOMPLETE', page: 424 }],
    });

    expect(motivos).toHaveLength(3);
    expect(motivos[0]).toMatch(/^La página 424/);
    expect(motivos[1]).toMatch(/saldo final/);
    expect(motivos[2]).toMatch(/totales de cargos y abonos/);
  });

  it('distingue un descuadre con el banco de una fila dudosa', () => {
    expect(esDescuadre({ warningCodes: ['BCP_BALANCE_MISMATCH'] })).toBe(true);
    expect(esDescuadre({ warningCodes: ['BCP_AMOUNT_UNPARSEABLE'] })).toBe(false);
  });
});

describe('diferenciaDeSaldo', () => {
  const descuadre = { warningCodes: ['BCP_BALANCE_MISMATCH'] };

  it('calcula cuánto falta con las cifras del Resumen', () => {
    expect(diferenciaDeSaldo(descuadre, RESUMEN)).toEqual({
      segunBanco: 125_000,
      segunMovimientos: 120_000,
      diferencia: 5_000,
    });
  });

  it('negativa cuando lo que falta son cargos', () => {
    const resumen = { ...RESUMEN, saldoFinal: 120_000 - 1_000 };
    expect(diferenciaDeSaldo(descuadre, resumen)?.diferencia).toBe(-1_000);
  });

  it('no inventa una diferencia sin el aviso del extractor, sin cifras o si cuadra', () => {
    expect(diferenciaDeSaldo({ warningCodes: [] }, RESUMEN)).toBeNull();
    expect(diferenciaDeSaldo(descuadre, null)).toBeNull();
    expect(diferenciaDeSaldo(descuadre, { ...RESUMEN, cargos: null })).toBeNull();
    expect(diferenciaDeSaldo(descuadre, { ...RESUMEN, saldoFinal: 120_000 })).toBeNull();
  });
});
