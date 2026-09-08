import { randomBytes, createHash } from 'node:crypto';

/**
 * Cookie de sesión: httpOnly para que ningún script de la página pueda leerla, y
 * por tanto un XSS no pueda llevarse la sesión de nadie.
 */
export const SESSION_COOKIE = 'eecc_session';

/** El token es opaco y de un solo uso por sesión; solo se guarda su hash. */
export function createSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSessionToken(token) };
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Lee una cookie de la cabecera `Cookie`.
 *
 * Se analiza a mano en lugar de añadir `cookie-parser`: el único valor que se lee
 * aquí es un token base64url, sin comillas ni caracteres que exijan las reglas
 * completas del RFC. Una dependencia menos que auditar.
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) {
    return null;
  }
  for (const parte of header.split(';')) {
    const separador = parte.indexOf('=');
    if (separador < 0) {
      continue;
    }
    if (parte.slice(0, separador).trim() === name) {
      return parte.slice(separador + 1).trim();
    }
  }
  return null;
}

export interface SessionCookieOptions {
  /** En producción la cookie viaja solo por HTTPS; en desarrollo local no hay TLS. */
  secure: boolean;
  maxAgeMs: number;
}

export function buildSessionCookieOptions(options: SessionCookieOptions): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    // `lax` y no `none`: la cookie no se envía en peticiones de otros sitios, lo que
    // corta el CSRF en las rutas que cambian estado sin necesitar un token aparte.
    sameSite: 'lax',
    secure: options.secure,
    path: '/',
    maxAge: options.maxAgeMs,
  };
}
