import {
  CotizacionInvalida,
  cotizar,
  formaDePrecioValida,
  paqueteMasConveniente,
  type ProductoCotizable,
} from './commercial-pricing';

const RECARGA: ProductoCotizable = {
  code: 'RECARGA',
  name: 'ATLAS Recargas',
  pricing: 'PER_PAGE',
  pageQuantity: null,
  minimumPages: 20,
  priceCents: 15,
  currency: 'PEN',
  validityDays: 90,
};

function paquete(paginas: number, centimos: number): ProductoCotizable {
  return {
    code: `PROFESIONAL_${String(paginas)}`,
    name: `ATLAS Profesional ${String(paginas)}`,
    pricing: 'PACKAGE',
    pageQuantity: paginas,
    minimumPages: null,
    priceCents: centimos,
    currency: 'PEN',
    validityDays: 90,
  };
}

const P500 = paquete(500, 2990);
const P2000 = paquete(2000, 5990);
const P6000 = paquete(6000, 8990);
const CATALOGO = [RECARGA, P500, P2000, P6000];

describe('cotizar una recarga', () => {
  it('cobra exacto por página, sin redondear a múltiplos', () => {
    expect(cotizar(RECARGA, 23, CATALOGO)).toEqual({
      productCode: 'RECARGA',
      pages: 23,
      priceCents: 345,
      currency: 'PEN',
      validityDays: 90,
      suggestion: null,
    });
  });

  it('acepta el mínimo justo y sin cantidad cotiza el mínimo', () => {
    expect(cotizar(RECARGA, 20).priceCents).toBe(300);
    expect(cotizar(RECARGA, undefined)).toMatchObject({ pages: 20, priceCents: 300 });
  });

  it('rechaza menos del mínimo', () => {
    expect(() => cotizar(RECARGA, 19)).toThrow(CotizacionInvalida);
    expect(() => cotizar(RECARGA, 19)).toThrow('QUANTITY_BELOW_MINIMUM');
  });

  it('rechaza cantidades absurdas o no enteras', () => {
    expect(() => cotizar(RECARGA, 100_001)).toThrow('QUANTITY_ABOVE_MAXIMUM');
    expect(() => cotizar(RECARGA, 20.5)).toThrow('QUANTITY_BELOW_MINIMUM');
  });

  it('sugiere Profesional 500 cuando las páginas sueltas cuestan más', () => {
    // 200 × S/0.15 = S/30.00, y Profesional 500 cuesta S/29.90 con más páginas.
    const cotizacion = cotizar(RECARGA, 200, CATALOGO);

    expect(cotizacion.priceCents).toBe(3000);
    expect(cotizacion.suggestion).toEqual({
      productCode: 'PROFESIONAL_500',
      name: 'ATLAS Profesional 500',
      pages: 500,
      priceCents: 2990,
      savingsCents: 10,
    });
  });

  it('no sugiere nada mientras la recarga sea más barata', () => {
    // 199 × S/0.15 = S/29.85, menos que Profesional 500.
    expect(cotizar(RECARGA, 199, CATALOGO).suggestion).toBeNull();
  });

  it('sugiere el paquete que alcanza, no uno que se queda corto', () => {
    // 1000 páginas sueltas: S/150.00. 500 no alcanza; 2000 sí y es el más barato que alcanza.
    expect(cotizar(RECARGA, 1000, CATALOGO).suggestion).toMatchObject({
      productCode: 'PROFESIONAL_2000',
      savingsCents: 15000 - 5990,
    });
  });

  it('con más páginas que cualquier paquete no sugiere ninguno', () => {
    expect(cotizar(RECARGA, 7000, CATALOGO).suggestion).toBeNull();
  });
});

describe('cotizar un paquete', () => {
  it('se vende entero: lo pedido no cambia ni las páginas ni el precio', () => {
    expect(cotizar(P2000, 3, CATALOGO)).toEqual({
      productCode: 'PROFESIONAL_2000',
      pages: 2000,
      priceCents: 5990,
      currency: 'PEN',
      validityDays: 90,
      suggestion: null,
    });
  });
});

describe('paqueteMasConveniente', () => {
  it('a igual precio prefiere el de más páginas', () => {
    const otro = { ...paquete(800, 2990), code: 'OTRO' };

    expect(paqueteMasConveniente(300, 4500, 'PEN', [P500, otro])?.productCode).toBe('OTRO');
  });

  it('no mezcla monedas', () => {
    const enDolares = { ...P500, currency: 'USD' };

    expect(paqueteMasConveniente(200, 3000, 'PEN', [enDolares])).toBeNull();
  });
});

describe('formaDePrecioValida', () => {
  it('un paquete lleva cantidad y no mínimo; una recarga, mínimo y no cantidad', () => {
    expect(formaDePrecioValida('PACKAGE', 500, null)).toBe(true);
    expect(formaDePrecioValida('PACKAGE', null, null)).toBe(false);
    expect(formaDePrecioValida('PACKAGE', 500, 20)).toBe(false);
    expect(formaDePrecioValida('PER_PAGE', null, 20)).toBe(true);
    expect(formaDePrecioValida('PER_PAGE', null, null)).toBe(false);
    expect(formaDePrecioValida('PER_PAGE', 500, 20)).toBe(false);
  });
});
