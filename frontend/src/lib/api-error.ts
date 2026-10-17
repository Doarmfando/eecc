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
  UNSUPPORTED_MEDIA_TYPE:
    'El archivo no es un PDF. Sube el estado de cuenta en PDF, tal como lo descargaste de tu banca.',
  UPLOAD_TOO_LARGE:
    'El archivo es más grande de lo que el servidor acepta. Prueba con un PDF más liviano.',
  INVALID_PDF:
    'No se pudo abrir el PDF: puede estar dañado o incompleto. Descárgalo de nuevo desde tu banca y vuelve a subirlo.',
  PDF_PASSWORD_REQUIRED:
    'El PDF está protegido con contraseña. Escríbela en «Contraseña del PDF» y vuelve a procesarlo.',
  PDF_PASSWORD_INCORRECT: 'La contraseña no abre el PDF. Revísala y vuelve a procesarlo.',
  PDF_SIZE_LIMIT_EXCEEDED:
    'El documento es más grande de lo que el procesador acepta. Prueba con un PDF más liviano.',
  UNSUPPORTED_DOCUMENT:
    'El documento no corresponde a un estado de cuenta compatible. Revisa que sea el PDF original del banco y no una captura, una constancia u otro documento.',
  STATEMENT_NOT_EXPORTABLE:
    'No se pudo leer ningún movimiento del documento, así que no hay archivo para descargar. Revisa que sea el estado de cuenta completo.',
  INVALID_IDEMPOTENCY_KEY: 'La clave de idempotencia tiene un formato inválido.',
  VALIDATION_FAILED:
    'Algún dato no es válido. Revisa el archivo, el año del periodo y la contraseña.',
  JOB_NOT_FOUND: 'No existe ese trabajo o no lo subiste tú.',
  ARTIFACT_NOT_FOUND: 'Ese archivo ya no está disponible para descargar.',
  STATEMENT_NOT_CONSOLIDABLE:
    'Ese documento no publicó el CSV de movimientos, así que no se puede consolidar.',
  INVALID_CURSOR: 'La página solicitada no es válida; vuelve a cargar el historial.',
  WORKER_UNAVAILABLE: 'El procesador no está disponible. Intenta de nuevo en unos minutos.',
  WORKER_REJECTED_DOCUMENT:
    'No se pudo procesar el documento. Intenta de nuevo; si se repite, comparte la referencia de abajo con soporte.',
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
