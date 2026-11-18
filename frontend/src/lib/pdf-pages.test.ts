import { describe, expect, it } from 'vitest';

import { countPdfPages } from './pdf-pages';

describe('countPdfPages', () => {
  it('con un archivo que no es un PDF válido, no rompe: vuelve null', async () => {
    // No se usa una muestra real (AGENTS.md): basta un archivo que pdf.js no
    // pueda abrir para probar que el error se atrapa en vez de propagarse.
    const archivo = new File(['no soy un pdf'], 'falso.pdf', { type: 'application/pdf' });
    await expect(countPdfPages(archivo)).resolves.toBeNull();
  });
});
