/**
 * Importes del CSV a centavos enteros, sin pasar por coma flotante.
 *
 * El worker escribe los `Decimal` en notación plana (`format(value, "f")`):
 * signo opcional, dígitos, punto decimal. `Number("1234.56") * 100` da
 * `123455.99999999999`, así que aquí no se multiplica: se leen los dígitos y se
 * componen los centavos como entero.
 */

const PLAIN_DECIMAL = /^([+-])?(\d+)(?:\.(\d+))?$/;

/** `null` cuando la celda está vacía o no es un decimal plano: no se inventa un 0. */
export function parseCents(raw: string): number | null {
  const match = PLAIN_DECIMAL.exec(raw.trim());
  if (!match) {
    return null;
  }
  const [, sign, whole, fraction = ''] = match;
  const cents = Number(`${whole ?? '0'}${fraction.padEnd(2, '0').slice(0, 2)}`);
  if (!Number.isSafeInteger(cents)) {
    return null;
  }
  // Un tercer decimal solo puede venir de un importe que el banco no expresa en
  // centavos; se redondea al alza en valor absoluto, como haría una caja.
  const rounded = Number(fraction[2] ?? '0') >= 5 ? cents + 1 : cents;
  return sign === '-' ? -rounded : rounded;
}

/** Como {@link parseCents}, pero una celda ilegible cuenta como cero. */
export function parseCentsOrZero(raw: string): number {
  return parseCents(raw) ?? 0;
}

/**
 * Hasta S/ 999,999.99, como admite la API (`priceCents` ≤ 99,999,999). Coma o
 * punto decimal, porque en Perú se escriben las dos.
 */
const PRICE_INPUT = /^(\d{1,6})(?:[.,](\d{1,2}))?$/;

/**
 * Lo que alguien escribe como precio («19.90», «19,9», «20») a céntimos enteros.
 *
 * `null` si no es un precio: con signo, más de dos decimales o letras. A
 * diferencia de {@link parseCents}, aquí un tercer decimal no se redondea: en
 * un precio es un error de tipeo y hay que decirlo, no adivinar.
 */
export function parsePriceInput(raw: string): number | null {
  const match = PRICE_INPUT.exec(raw.trim());
  if (!match) {
    return null;
  }
  const [, whole = '0', fraction = ''] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Céntimos al texto que se pone en un campo de precio: `1990` → `"19.90"`. */
export function centsToPriceInput(cents: number): string {
  const whole = Math.trunc(cents / 100);
  return `${String(whole)}.${String(cents % 100).padStart(2, '0')}`;
}
