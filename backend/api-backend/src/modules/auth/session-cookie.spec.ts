import {
  SESSION_COOKIE,
  buildSessionCookieOptions,
  createSessionToken,
  hashSessionToken,
  readCookie,
} from './session-cookie';

describe('createSessionToken', () => {
  it('genera un token distinto cada vez y guarda solo su hash', () => {
    const primero = createSessionToken();
    const segundo = createSessionToken();

    expect(primero.token).not.toEqual(segundo.token);
    expect(primero.tokenHash).toEqual(hashSessionToken(primero.token));
    // El hash no permite reconstruir el token: quien lea la tabla no puede suplantar.
    expect(primero.tokenHash).not.toContain(primero.token);
    expect(primero.tokenHash).toHaveLength(64);
  });
});

describe('readCookie', () => {
  it('encuentra la cookie entre otras y devuelve null si no está', () => {
    const cabecera = `theme=dark; ${SESSION_COOKIE}=abc123; otra=valor`;

    expect(readCookie(cabecera, SESSION_COOKIE)).toBe('abc123');
    expect(readCookie(cabecera, 'inexistente')).toBeNull();
    expect(readCookie(undefined, SESSION_COOKIE)).toBeNull();
    expect(readCookie('', SESSION_COOKIE)).toBeNull();
  });

  it('no confunde una cookie cuyo nombre contiene al buscado', () => {
    expect(readCookie(`otro_${SESSION_COOKIE}=ajeno`, SESSION_COOKIE)).toBeNull();
  });

  it('tolera espacios y entradas sin signo igual', () => {
    expect(readCookie(`  ${SESSION_COOKIE} = con-espacios ; rota`, SESSION_COOKIE)).toBe(
      'con-espacios',
    );
  });
});

describe('buildSessionCookieOptions', () => {
  it('marca la cookie como inaccesible desde JavaScript', () => {
    const opciones = buildSessionCookieOptions({ secure: true, maxAgeMs: 3600_000 });

    // `httpOnly` es lo que impide que un XSS se lleve la sesión, y `sameSite` corta
    // el CSRF sin necesidad de un token aparte.
    expect(opciones.httpOnly).toBe(true);
    expect(opciones.sameSite).toBe('lax');
    expect(opciones.secure).toBe(true);
    expect(opciones.maxAge).toBe(3600_000);
  });

  it('permite servir sin TLS en desarrollo local', () => {
    expect(buildSessionCookieOptions({ secure: false, maxAgeMs: 1 }).secure).toBe(false);
  });
});
