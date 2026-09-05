/**
 * Entrega el archivo al usuario y libera el objeto temporal.
 * Se aísla en su propio módulo para poder sustituirlo en pruebas sin tocar la UI.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();

  // Revocar en el mismo tick cancela la descarga antes de que el navegador la inicie.
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 0);
}
