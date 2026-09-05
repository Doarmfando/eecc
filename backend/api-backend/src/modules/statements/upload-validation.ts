import { PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';

const PDF_MAGIC = Buffer.from('%PDF-');

export interface UploadCandidate {
  content: Buffer;
  mimeType: string;
}

/**
 * Puerta de entrada común a los dos modos de persistencia: lo que se rechaza con
 * base de datos se rechaza igual sin ella. Un documento que no empieza por la
 * firma de PDF no llega nunca al worker.
 */
export function assertAcceptableUpload(candidate: UploadCandidate, maxBytes: number): void {
  if (candidate.content.byteLength > maxBytes) {
    throw new PayloadTooLargeException({ code: 'UPLOAD_TOO_LARGE' });
  }
  if (
    candidate.mimeType !== 'application/pdf' &&
    candidate.mimeType !== 'application/octet-stream'
  ) {
    throw new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  if (
    candidate.content.byteLength === 0 ||
    !candidate.content.subarray(0, 1024).includes(PDF_MAGIC)
  ) {
    throw new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
}
