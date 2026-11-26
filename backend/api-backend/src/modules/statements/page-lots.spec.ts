import {
  compararFefo,
  disponible,
  distribuirConsumo,
  periodoVigente,
  repartirFefo,
  sinConsumir,
  type LoteConSaldo,
} from './page-lots';

const BASE = new Date('2026-11-01T05:00:00Z');

function lote(
  id: string,
  datos: Partial<LoteConSaldo> & { quantity: number },
): LoteConSaldo & { id: string } {
  return {
    source: 'PURCHASE',
    consumed: 0,
    held: 0,
    startsAt: BASE,
    expiresAt: null,
    createdAt: BASE,
    ...datos,
    id,
  };
}

const dia = (iso: string): Date => new Date(`${iso}T05:00:00Z`);

describe('saldo de un lote', () => {
  it('lo disponible descuenta lo consumido y lo apartado, sin bajar de cero', () => {
    expect(disponible({ quantity: 50, consumed: 20, held: 10 })).toBe(20);
    expect(disponible({ quantity: 50, consumed: 45, held: 10 })).toBe(0);
    expect(sinConsumir({ quantity: 50, consumed: 45 })).toBe(5);
  });
});

describe('orden FEFO', () => {
  it('primero el que vence antes; los que no vencen, al final', () => {
    const recarga = lote('recarga', { quantity: 100, expiresAt: dia('2027-02-01') });
    const periodo = lote('periodo', { quantity: 50, expiresAt: dia('2026-12-01') });
    const prueba = lote('prueba', { quantity: 3, expiresAt: null });

    const orden = [prueba, recarga, periodo].sort(compararFefo).map((l) => l.id);

    expect(orden).toEqual(['periodo', 'recarga', 'prueba']);
  });

  it('a igual vencimiento, el más antiguo primero', () => {
    const viejo = lote('viejo', {
      quantity: 1,
      expiresAt: dia('2027-01-01'),
      startsAt: dia('2026-10-01'),
    });
    const nuevo = lote('nuevo', {
      quantity: 1,
      expiresAt: dia('2027-01-01'),
      startsAt: dia('2026-10-05'),
    });

    expect([nuevo, viejo].sort(compararFefo).map((l) => l.id)).toEqual(['viejo', 'nuevo']);
  });
});

describe('repartirFefo', () => {
  const periodo = lote('periodo', { quantity: 50, consumed: 40, expiresAt: dia('2026-12-01') });
  const recarga = lote('recarga', { quantity: 100, held: 30, expiresAt: dia('2027-02-01') });
  const profesional = lote('profesional', { quantity: 500, expiresAt: dia('2027-03-01') });

  it('gasta primero el periodo y sigue con la compra que vence antes', () => {
    const reparto = repartirFefo([profesional, recarga, periodo], 90);

    expect(reparto.map(({ lote: l, pages }) => [l.id, pages])).toEqual([
      ['periodo', 10],
      ['recarga', 70],
      ['profesional', 10],
    ]);
  });

  it('no toca un lote sin disponible ni pide más de lo necesario', () => {
    const agotado = lote('agotado', { quantity: 10, consumed: 10, expiresAt: dia('2026-11-20') });

    const reparto = repartirFefo([agotado, periodo, recarga], 5);

    expect(reparto.map(({ lote: l, pages }) => [l.id, pages])).toEqual([['periodo', 5]]);
  });
});

describe('distribuirConsumo', () => {
  it('lo consumido llena primero lo apartado en el lote que vence antes', () => {
    const asignaciones = [
      { id: 'periodo', reservedPages: 10 },
      { id: 'recarga', reservedPages: 70 },
      { id: 'profesional', reservedPages: 10 },
    ];

    expect(
      distribuirConsumo(asignaciones, 25).map(({ asignacion, consumed }) => [
        asignacion.id,
        consumed,
      ]),
    ).toEqual([
      ['periodo', 10],
      ['recarga', 15],
      ['profesional', 0],
    ]);
  });

  it('nunca pasa de lo apartado en cada lote', () => {
    const asignaciones = [{ id: 'unico', reservedPages: 10 }];

    expect(distribuirConsumo(asignaciones, 999)[0]?.consumed).toBe(10);
    expect(distribuirConsumo(asignaciones, -3)[0]?.consumed).toBe(0);
  });
});

describe('periodoVigente', () => {
  it('el periodo empieza el día del ancla de cada mes', () => {
    expect(periodoVigente('2026-10-15', '2026-11-26')).toEqual({
      inicio: '2026-11-15',
      fin: '2026-12-15',
    });
    expect(periodoVigente('2026-10-15', '2026-11-14')).toEqual({
      inicio: '2026-10-15',
      fin: '2026-11-15',
    });
  });

  it('el mismo día del ancla ya es el periodo nuevo', () => {
    expect(periodoVigente('2026-10-15', '2026-11-15').inicio).toBe('2026-11-15');
    expect(periodoVigente('2026-11-26', '2026-11-26')).toEqual({
      inicio: '2026-11-26',
      fin: '2026-12-26',
    });
  });

  it('un ancla a fin de mes se recorta en los meses cortos y vuelve al 31 cuando puede', () => {
    expect(periodoVigente('2027-01-31', '2027-02-28')).toEqual({
      inicio: '2027-02-28',
      fin: '2027-03-31',
    });
    expect(periodoVigente('2027-01-31', '2027-02-27')).toEqual({
      inicio: '2027-01-31',
      fin: '2027-02-28',
    });
    expect(periodoVigente('2027-01-31', '2027-04-05')).toEqual({
      inicio: '2027-03-31',
      fin: '2027-04-30',
    });
  });

  it('cruza el fin de año y varios años', () => {
    expect(periodoVigente('2026-12-10', '2027-01-09').inicio).toBe('2026-12-10');
    expect(periodoVigente('2025-06-01', '2027-01-20')).toEqual({
      inicio: '2027-01-01',
      fin: '2027-02-01',
    });
  });

  it('un ancla futura (reloj desfasado) da el primer periodo, sin fechas negativas', () => {
    expect(periodoVigente('2026-11-27', '2026-11-26')).toEqual({
      inicio: '2026-11-27',
      fin: '2026-12-27',
    });
  });
});
