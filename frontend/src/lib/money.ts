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
