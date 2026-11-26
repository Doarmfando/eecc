import { Prisma } from '@prisma/client';

import { centsToDecimal, decimalToCents } from './cents';

describe('céntimos', () => {
  it('convierte sin los errores de la coma flotante', () => {
    // 19.90 * 100 en coma flotante da 1989.9999999999998.
    expect(decimalToCents(new Prisma.Decimal('19.90'))).toBe(1990);
    expect(decimalToCents(new Prisma.Decimal('0.15'))).toBe(15);
    expect(decimalToCents(new Prisma.Decimal('89.90'))).toBe(8990);
    expect(decimalToCents(new Prisma.Decimal('0'))).toBe(0);
  });

  it('ida y vuelta da el mismo importe', () => {
    expect(centsToDecimal(1990).toFixed(2)).toBe('19.90');
    expect(centsToDecimal(15).toFixed(2)).toBe('0.15');
    expect(decimalToCents(centsToDecimal(2990))).toBe(2990);
  });
});
