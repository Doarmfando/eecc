import type { NextFunction, Request, Response } from 'express';

import { crearFallbackDeAplicacion, debeServirLaAplicacion } from './spa-fallback';

const NAVEGADOR = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

function peticion(
  path: string,
  extra: { method?: string; accept?: string } = {},
): {
  method: string;
  path: string;
  accept: string | undefined;
} {
  return {
    method: extra.method ?? 'GET',
    path,
    accept: 'accept' in extra ? extra.accept : NAVEGADOR,
  };
}

describe('debeServirLaAplicacion', () => {
  it('devuelve la página en las rutas del frontend, para que recargar funcione', () => {
    for (const ruta of [
      '/',
      '/personas',
      '/jobs/33333333-3333-4333-8333-333333333333',
      '/entrar',
    ]) {
      expect(debeServirLaAplicacion(peticion(ruta))).toBe(true);
    }
  });

  it('deja que la API responda 404 en JSON en lugar de devolver HTML', () => {
    // Si `/v1/...` devolviera la página, un cliente que espera JSON recibiría HTML
    // y el error real quedaría oculto tras un fallo de parseo.
    for (const ruta of ['/v1/jobs', '/v1/auth/me', '/v1/users/inexistente', '/health', '/docs']) {
      expect(debeServirLaAplicacion(peticion(ruta))).toBe(false);
    }
  });

  it('no devuelve la página cuando se pedía un archivo', () => {
    // Servir HTML donde se esperaba JavaScript da el críptico «Unexpected token '<'».
    for (const ruta of [
      '/assets/index-abc123.js',
      '/assets/index-abc123.css',
      '/favicon.ico',
      '/imagen.png',
    ]) {
      expect(debeServirLaAplicacion(peticion(ruta))).toBe(false);
    }
  });

  it('solo atiende lecturas', () => {
    for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(debeServirLaAplicacion(peticion('/personas', { method: metodo }))).toBe(false);
    }
    expect(debeServirLaAplicacion(peticion('/personas', { method: 'HEAD' }))).toBe(true);
  });

  it('no responde con una página a quien pidió JSON', () => {
    expect(debeServirLaAplicacion(peticion('/personas', { accept: 'application/json' }))).toBe(
      false,
    );
    // Sin cabecera no hay forma de saberlo: se asume navegador, que es quien recarga.
    expect(debeServirLaAplicacion(peticion('/personas', { accept: undefined }))).toBe(true);
  });

  it('no confunde una ruta que empieza igual que una del servidor', () => {
    // `/version` no es `/v1/`, y `/healthcheck` no es `/health`.
    expect(debeServirLaAplicacion(peticion('/version'))).toBe(true);
    expect(debeServirLaAplicacion(peticion('/v1'))).toBe(true);
    expect(debeServirLaAplicacion(peticion('/healthcheck'))).toBe(true);
  });
});

describe('crearFallbackDeAplicacion', () => {
  const INDEX = '/app/public/index.html';

  function ejecutar(
    path: string,
    opciones: { method?: string; errorAlEnviar?: Error } = {},
  ): { sendFile: jest.Mock; next: jest.Mock } {
    const sendFile = jest.fn((_ruta: string, callback: (error?: Error) => void) => {
      callback(opciones.errorAlEnviar);
    });
    const next = jest.fn();
    const peticion = {
      method: opciones.method ?? 'GET',
      path,
      headers: { accept: NAVEGADOR },
    } as unknown as Request;

    crearFallbackDeAplicacion(INDEX)(
      peticion,
      { sendFile } as unknown as Response,
      next as NextFunction,
    );
    return { sendFile, next };
  }

  it('entrega la página en una ruta del frontend', () => {
    const { sendFile, next } = ejecutar('/personas');

    expect(sendFile).toHaveBeenCalledWith(INDEX, expect.any(Function));
    expect(next).not.toHaveBeenCalled();
  });

  it('cede el paso a Nest en las rutas de la API', () => {
    const { sendFile, next } = ejecutar('/v1/jobs');

    expect(sendFile).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it('propaga un fallo al leer el archivo en vez de dejar la petición colgada', () => {
    const fallo = new Error('index.html ilegible');
    const { next } = ejecutar('/personas', { errorAlEnviar: fallo });

    expect(next).toHaveBeenCalledWith(fallo);
  });
});
