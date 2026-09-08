import type { NextFunction, Request, Response } from 'express';

/**
 * Rutas que pertenecen al servidor y nunca deben devolver la página del frontend.
 *
 * `/docs` se compara por prefijo porque Swagger sirve también `/docs-json` y sus
 * propios estáticos. `/health` es una ruta exacta: excluirla por prefijo se llevaría
 * por delante cualquier ruta del frontend que empiece igual, como `/healthcheck`.
 */
const PREFIJOS_DEL_SERVIDOR = ['/v1/', '/docs'];
const RUTAS_EXACTAS_DEL_SERVIDOR = ['/health'];

/** Un nombre con extensión pide un archivo concreto, no una vista de la aplicación. */
const PARECE_ARCHIVO = /\.[a-z0-9]{1,8}$/i;

export interface PeticionParaSpa {
  method: string;
  path: string;
  accept: string | undefined;
}

/**
 * Decide si una petición sin ruta en el servidor debe recibir el `index.html`.
 *
 * El enrutado del frontend vive en el navegador: al recargar en `/personas`, el
 * servidor no tiene esa ruta y debe devolver la página para que React resuelva.
 *
 * Lo que **no** debe caer aquí:
 * - las rutas de la API, que tienen que responder 404 en JSON y no una página;
 * - las peticiones de archivos (`/assets/algo.js`), porque devolver HTML donde se
 *   esperaba JavaScript produce el críptico «Unexpected token '<'» en el navegador;
 * - cualquier método que no sea de lectura.
 */
export function debeServirLaAplicacion(peticion: PeticionParaSpa): boolean {
  if (peticion.method !== 'GET' && peticion.method !== 'HEAD') {
    return false;
  }
  if (PREFIJOS_DEL_SERVIDOR.some((prefijo) => peticion.path.startsWith(prefijo))) {
    return false;
  }
  if (RUTAS_EXACTAS_DEL_SERVIDOR.includes(peticion.path)) {
    return false;
  }
  if (PARECE_ARCHIVO.test(peticion.path)) {
    return false;
  }
  // Sin `Accept` no se puede saber qué espera quien llama; se asume navegador,
  // que es quien recarga una ruta del frontend.
  return peticion.accept === undefined || peticion.accept.includes('text/html');
}

/**
 * Middleware que entrega la aplicación cuando ninguna ruta del servidor coincidió.
 *
 * Se registra después del enrutador de Nest a propósito: así solo ve lo que nadie
 * más quiso atender.
 */
export function crearFallbackDeAplicacion(
  rutaIndex: string,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    const procede = debeServirLaAplicacion({
      method: request.method,
      path: request.path,
      accept: request.headers.accept,
    });
    if (!procede) {
      next();
      return;
    }
    response.sendFile(rutaIndex, (error) => {
      if (error) {
        next(error);
      }
    });
  };
}
