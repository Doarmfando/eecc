import { describe, expect, it } from 'vitest';

import { formatCellAmount } from './cell-amount';

describe('formatCellAmount', () => {
  it('muestra los céntimos: el neto del día cuadra con la suma de su detalle', () => {
    // 5.00 + 9.00 + 9.00 − 8.80 − 11.69 − 9.00 − 9.00 = −15.49, no −15.
    expect(formatCellAmount('−', 1549)).toEqual({ full: '−15.49', compact: null, fit: null });
    expect(formatCellAmount('+', 500).full).toBe('+5.00');
    expect(formatCellAmount('', 0).full).toBe('0.00');
  });

  it('por debajo de mil soles no hay versión compacta', () => {
    expect(formatCellAmount('−', 99_999)).toEqual({ full: '−999.99', compact: null, fit: null });
  });

  it('desde mil soles ofrece la versión redondeada y el ancho que pide la completa', () => {
    expect(formatCellAmount('', 103_955)).toEqual({
      full: '1,039.55',
      compact: '1.04K',
      fit: { compact: '@min-[3rem]:hidden', full: '@min-[3rem]:inline' },
    });
    expect(formatCellAmount('−', 6_638_745)).toEqual({
      full: '−66,387.45',
      compact: '−66.4K',
      fit: { compact: '@min-[3.75rem]:hidden', full: '@min-[3.75rem]:inline' },
    });
    expect(formatCellAmount('', 123_461_450)).toMatchObject({
      full: '1,234,614.50',
      compact: '1.23M',
      fit: { full: '@min-[5rem]:inline' },
    });
  });

  it('desde mil millones el completo no cabe en ninguna celda y se queda en compacto', () => {
    expect(formatCellAmount('', 123_456_789_000)).toEqual({
      full: '1,234,567,890.00',
      compact: '1.23B',
      fit: null,
    });
  });
});
