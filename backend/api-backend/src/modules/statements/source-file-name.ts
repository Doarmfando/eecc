/** Etiqueta visible al dueño, separada de las rutas y nombres de artefactos. */
export function sourceFileName(value: string): string | null {
  const basename = value.split(/[\\/]/).at(-1) ?? '';
  const clean = basename
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Bidi_Control}]/gu, '')
    .trim();
  return clean && clean !== '.' && clean !== '..' ? Array.from(clean).slice(0, 255).join('') : null;
}
