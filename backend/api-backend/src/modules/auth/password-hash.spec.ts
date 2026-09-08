import {
  MIN_PASSWORD_LENGTH,
  assertUsablePassword,
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from './password-hash';

const CONTRASENA = 'una-contraseña-larga-de-prueba';

describe('hashPassword y verifyPassword', () => {
  it('acepta la contraseña correcta y rechaza cualquier otra', async () => {
    const hash = await hashPassword(CONTRASENA);

    await expect(verifyPassword(CONTRASENA, hash)).resolves.toBe(true);
    await expect(verifyPassword(`${CONTRASENA}x`, hash)).resolves.toBe(false);
    await expect(verifyPassword('', hash)).resolves.toBe(false);
  });

  it('nunca guarda la contraseña en claro y usa una sal distinta cada vez', async () => {
    const primero = await hashPassword(CONTRASENA);
    const segundo = await hashPassword(CONTRASENA);

    expect(primero).not.toContain(CONTRASENA);
    // Dos hashes iguales delatarían que no hay sal: quien robe la tabla sabría al
    // instante qué personas comparten contraseña.
    expect(primero).not.toEqual(segundo);
    await expect(verifyPassword(CONTRASENA, segundo)).resolves.toBe(true);
  });

  it('lleva sus parámetros dentro para poder endurecerlos sin invalidar lo guardado', async () => {
    const hash = await hashPassword(CONTRASENA);
    const [algoritmo, coste, bloque, paralelismo] = hash.split('$');

    expect(algoritmo).toBe('scrypt');
    expect(Number(coste)).toBeGreaterThanOrEqual(2 ** 14);
    expect(Number(bloque)).toBeGreaterThan(0);
    expect(Number(paralelismo)).toBeGreaterThan(0);
  });

  it('devuelve false ante un hash ilegible en vez de romper la autenticación', async () => {
    for (const roto of ['', 'texto-suelto', 'scrypt$abc$8$1$sal$clave', 'otro$1$2$3$4$5']) {
      await expect(verifyPassword(CONTRASENA, roto)).resolves.toBe(false);
    }
  });

  it('trata como iguales dos formas Unicode del mismo texto', async () => {
    // "contraseña" escrita con ñ compuesta y descompuesta se ve idéntica al teclear.
    const compuesta = 'contraseña-de-prueba';
    const descompuesta = 'contraseña-de-prueba';

    const hash = await hashPassword(compuesta);
    await expect(verifyPassword(descompuesta, hash)).resolves.toBe(true);
  });
});

describe('assertUsablePassword', () => {
  it('exige una longitud mínima', () => {
    expect(() => {
      assertUsablePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1));
    }).toThrow();
    expect(() => {
      assertUsablePassword('a'.repeat(MIN_PASSWORD_LENGTH));
    }).not.toThrow();
  });

  it('pone tope arriba para que un intento no cueste CPU sin límite', () => {
    expect(() => {
      assertUsablePassword('a'.repeat(5000));
    }).toThrow();
  });
});

describe('normalizeEmail', () => {
  it('ignora mayúsculas y espacios, que no distinguen una cuenta de otra', () => {
    expect(normalizeEmail('  Persona@Empresa.PE ')).toBe('persona@empresa.pe');
  });
});
