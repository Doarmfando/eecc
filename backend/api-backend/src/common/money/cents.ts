import { Prisma } from '@prisma/client';

/**
 * Importes de la base (`DECIMAL(10,2)`, soles) a céntimos enteros para la API, y
 * de vuelta. La interfaz trabaja en céntimos (`docs/arquitectura/monedas.md`):
 * así ningún importe pasa por coma flotante en ninguno de los dos lados.
 */
export function decimalToCents(importe: Prisma.Decimal): number {
  return importe.mul(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

export function centsToDecimal(centimos: number): Prisma.Decimal {
  return new Prisma.Decimal(centimos).div(100);
}
