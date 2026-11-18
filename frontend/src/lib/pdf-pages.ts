import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
// Vite resuelve este `?url` en tiempo de build; no es un módulo de verdad.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Cuenta las páginas de un PDF en el navegador, antes de subirlo (ADR-0018).
 *
 * `null` cuando no se puede saber sin más datos: un PDF con contraseña (pdf.js
 * no lee ni el número de páginas sin ella) o un archivo que no abre. En esos
 * casos la interfaz no debe bloquear la subida por esto: el worker cuenta de
 * verdad al procesar y ahí sale el aviso real si no alcanza el cupo.
 */
export async function countPdfPages(file: File): Promise<number | null> {
  try {
    const buffer = await file.arrayBuffer();
    const documento = await getDocument({ data: buffer }).promise;
    const paginas = documento.numPages;
    await documento.destroy();
    return paginas;
  } catch {
    return null;
  }
}
