/** Error del API ya sanitizado: código estable más el identificador de la petición. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    readonly requestId?: string,
    readonly details?: string[],
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

const MESSAGES: Record<string, string> = {
  AUTHENTICATION_REQUIRED: 'Necesitas iniciar sesión.',
  SESSION_EXPIRED: 'Tu sesión caducó. Vuelve a entrar.',
  INSUFFICIENT_ROLE: 'Tu rol no permite hacer esto.',
  DOCUMENT_REQUIRED: 'Selecciona un archivo PDF antes de enviar.',
  UNSUPPORTED_MEDIA_TYPE: 'El archivo no es un PDF válido.',
  UPLOAD_TOO_LARGE: 'El archivo supera el tamaño permitido.',
  INVALID_PDF: 'El documento no pudo leerse como PDF.',
  PDF_SIZE_LIMIT_EXCEEDED: 'El documento supera el límite de tamaño del procesador.',
  UNSUPPORTED_DOCUMENT: 'El documento no corresponde a un estado de cuenta compatible.',
  STATEMENT_NOT_EXPORTABLE: 'La extracción no produjo un resultado publicable.',
  INVALID_IDEMPOTENCY_KEY: 'La clave de idempotencia tiene un formato inválido.',
  VALIDATION_FAILED: 'Revisa los datos enviados.',
  JOB_NOT_FOUND: 'No existe ese trabajo o no lo subiste tú.',
  ARTIFACT_NOT_FOUND: 'Ese archivo ya no está disponible para descargar.',
  INVALID_CURSOR: 'La página solicitada no es válida; vuelve a cargar el historial.',
  WORKER_UNAVAILABLE: 'El procesador no está disponible. Intenta de nuevo en unos minutos.',
  WORKER_REJECTED_DOCUMENT: 'El procesador rechazó el documento.',
  WORKER_CONTRACT_MISMATCH: 'La respuesta del procesador no es compatible con esta versión.',
  RESPONSE_CONTRACT_MISMATCH: 'La respuesta del servidor no es compatible con esta versión.',
  NETWORK_ERROR: 'No se pudo contactar al servidor.',
};

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? 'Ocurrió un error inesperado al procesar la solicitud.';
  }
  return 'Ocurrió un error inesperado.';
}

/** Un fallo de credencial o de contrato no mejora reintentando. */
export function isRetriable(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  return error.httpStatus >= 500 || error.code === 'NETWORK_ERROR';
}
