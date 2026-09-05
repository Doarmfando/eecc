import { formatBytes } from '@/lib/format';

export const MAX_CLIENT_BYTES = 50 * 1024 * 1024;

/** Valida en el borde antes de gastar una llamada al servidor. */
export function validateStatementFile(candidate: File | null): string | null {
  if (!candidate) {
    return 'Selecciona un archivo PDF.';
  }
  if (!candidate.name.toLowerCase().endsWith('.pdf')) {
    return 'El archivo debe tener extensión .pdf.';
  }
  if (candidate.size === 0) {
    return 'El archivo está vacío.';
  }
  if (candidate.size > MAX_CLIENT_BYTES) {
    return `El archivo supera ${formatBytes(MAX_CLIENT_BYTES)}.`;
  }
  return null;
}
