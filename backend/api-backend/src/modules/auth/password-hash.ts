import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * `promisify` resuelve la sobrecarga sin opciones, y aquí hacen falta: los
 * parámetros de coste son justamente lo que hace útil a la derivación.
 */
function derivar(
  password: string,
  salt: Buffer,
  longitud: number,
  opciones: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, longitud, opciones, (error, clave) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(clave);
    });
  });
}

/**
 * Parámetros de derivación. `N` es el coste en memoria y tiempo: subirlo encarece
 * un ataque por fuerza bruta en la misma proporción. 2^15 tarda ~100 ms por intento
 * en un portátil, que es imperceptible al entrar y caro al probar millones de claves.
 *
 * Van dentro del hash almacenado, no fijos en el verificador: así se pueden endurecer
 * más adelante sin invalidar las contraseñas ya guardadas.
 */
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

const ALGORITHM = 'scrypt';
const SEPARATOR = '$';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

/**
 * Deriva una contraseña. El resultado es `scrypt$N$r$p$sal$clave`, en base64url.
 *
 * Se eligió `scrypt` de la biblioteca estándar y no argon2 o bcrypt porque ambos
 * exigen compilación nativa, que en Windows depende de tener toolchain instalada.
 * Un requisito de arranque a cambio de una diferencia teórica no compensaba.
 */
export async function hashPassword(password: string): Promise<string> {
  assertUsablePassword(password);

  const salt = randomBytes(SALT_LENGTH);
  const derived = await derivar(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    // Sin este margen, `scrypt` con N alto aborta por el límite por defecto de OpenSSL.
    maxmem: 256 * COST * BLOCK_SIZE,
  });

  return [
    ALGORITHM,
    String(COST),
    String(BLOCK_SIZE),
    String(PARALLELIZATION),
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join(SEPARATOR);
}

/**
 * Comprueba una contraseña contra su hash almacenado.
 *
 * Devuelve `false` ante cualquier hash ilegible en vez de lanzar: una fila corrupta
 * es un fallo de autenticación, no una caída del servicio, y así no se distingue
 * desde fuera entre "usuario sin contraseña" y "contraseña incorrecta".
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const partes = stored.split(SEPARATOR);
  if (partes.length !== 6 || partes[0] !== ALGORITHM) {
    return false;
  }

  const [, costRaw, blockRaw, parallelRaw, saltRaw, expectedRaw] = partes;
  const cost = Number(costRaw);
  const blockSize = Number(blockRaw);
  const parallelization = Number(parallelRaw);
  if (
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelization) ||
    cost < 2 ||
    blockSize < 1 ||
    parallelization < 1
  ) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltRaw ?? '', 'base64url');
    expected = Buffer.from(expectedRaw ?? '', 'base64url');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  let derived: Buffer;
  try {
    derived = await derivar(password.normalize('NFKC'), salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 256 * cost * blockSize,
    });
  } catch {
    return false;
  }

  // Comparación en tiempo constante: comparar con `===` filtra, por el tiempo de
  // respuesta, cuántos bytes iniciales acertó quien lo intenta.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function assertUsablePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`La contraseña necesita al menos ${String(MIN_PASSWORD_LENGTH)} caracteres`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    // Sin tope, una cadena enorme convierte cada intento en trabajo de CPU gratuito.
    throw new Error(`La contraseña no puede pasar de ${String(MAX_PASSWORD_LENGTH)} caracteres`);
  }
}

/** El correo es la clave de acceso: no puede depender de mayúsculas ni de espacios. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
