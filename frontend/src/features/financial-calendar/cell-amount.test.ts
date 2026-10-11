import { describe, expect, it } from 'vitest';

import { formatCellAmount } from './cell-amount';

describe('formatCellAmount', () => {
  it('muestra la moneda y los céntimos: el neto del día cuadra con la suma de su detalle', () => {
    // 5.00 + 9.00 + 9.00 − 8.80 − 11.69 − 9.00 − 9.00 = −15.49, no −15.
    expect(formatCellAmount('−', 1549, 'PEN')).toEqual({
      full: '−S/ 15.49',
      compact: '−15.49',
      fit: { compact: '@min-[3.75rem]:hidden', full: '@min-[3.75rem]:inline' },
    });
    expect(formatCellAmount('+', 500, 'PEN').full).toBe('+S/ 5.00');
    expect(formatCellAmount('', 0, 'PEN').full).toBe('S/ 0.00');
  });

  it('los dólares llevan su propio signo', () => {
    expect(formatCellAmount('+', 30000, 'USD')).toMatchObject({
      full: '+US$ 300.00',
      compact: '+300.00',
    });
  });

  it('por debajo de mil el compacto solo pierde el símbolo', () => {
    expect(formatCellAmount('−', 99_999, 'PEN')).toMatchObject({
      full: '−S/ 999.99',
      compact: '−999.99',
    });
  });

  it('desde mil ofrece la versión redondeada y el ancho que pide la completa', () => {
    expect(formatCellAmount('', 103_955, 'PEN')).toEqual({
      full: 'S/ 1,039.55',
      compact: '1.04K',
      fit: { compact: '@min-[5rem]:hidden', full: '@min-[5rem]:inline' },
    });
    expect(formatCellAmount('−', 6_638_745, 'USD')).toEqual({
      full: '−US$ 66,387.45',
      compact: '−66.4K',
      fit: { compact: '@min-[6rem]:hidden', full: '@min-[6rem]:inline' },
    });
    expect(formatCellAmount('+', 105_857_542, 'USD')).toMatchObject({
      full: '+US$ 1,058,575.42',
      compact: '+1.06M',
      fit: { full: '@min-[7rem]:inline' },
    });
  });

  it('desde mil millones el completo no cabe en ninguna celda y se queda en compacto', () => {
    expect(formatCellAmount('', 123_456_789_000, 'PEN')).toEqual({
      full: 'S/ 1,234,567,890.00',
      compact: '1.23B',
      fit: null,
    });
  });
});
