import { ApiError, describeErrorKind, errorCode } from './api-error';

export function formatearHora(fecha: Date): string {
  return fecha.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'medium' });
}

/** «Tipo: Documento · Código: INVALID_PDF · Referencia: … · Hora: …», para pegar o dictar. */
export function textoParaSoporte(error: unknown, ocurrio: Date): string {
  const referencia = error instanceof ApiError ? error.requestId : undefined;
  return [
    `Tipo: ${describeErrorKind(error)}`,
    `Código: ${errorCode(error)}`,
    ...(referencia ? [`Referencia: ${referencia}`] : []),
    `Hora: ${formatearHora(ocurrio)}`,
  ].join(' · ');
}
