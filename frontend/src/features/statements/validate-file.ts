import { formatBytes } from '@/lib/format';

export const MAX_CLIENT_BYTES = 50 * 1024 * 1024;

/**
 * Valida en el borde antes de gastar una llamada al servidor.
 *
 * Cada mensaje nombra el archivo y dice qué hacer: quien arrastra varios PDF
 * seguidos necesita saber cuál falló y por qué, no solo que algo falló.
 */
export function validateStatementFile(candidate: File | null): string | null {
  if (!candidate) {
    return 'Selecciona un archivo PDF.';
  }
  if (!candidate.name.toLowerCase().endsWith('.pdf')) {
    return `«${candidate.name}» no es un PDF. Sube el estado de cuenta en PDF, tal como lo descargaste de tu banca.`;
  }
  if (candidate.size === 0) {
    return `«${candidate.name}» está vacío. Descárgalo de nuevo desde tu banca y vuelve a subirlo.`;
  }
  if (candidate.size > MAX_CLIENT_BYTES) {
    return `«${candidate.name}» pesa ${formatBytes(candidate.size)} y el máximo es ${formatBytes(MAX_CLIENT_BYTES)}.`;
  }
  return null;
}
