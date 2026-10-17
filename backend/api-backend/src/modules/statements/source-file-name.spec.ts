import { sourceFileName } from './source-file-name';

describe('sourceFileName', () => {
  it('conserva espacios, acentos y la extensión', () => {
    expect(sourceFileName('Estado sintético agosto.pdf')).toBe('Estado sintético agosto.pdf');
    expect(sourceFileName('Cuenta 👨‍💻.pdf')).toBe('Cuenta 👨‍💻.pdf');
  });

  it.each(['C:\\fakepath\\Estado.pdf', '/tmp/Estado.pdf'])('descarta la ruta: %s', (name) => {
    expect(sourceFileName(name)).toBe('Estado.pdf');
  });

  it('elimina controles y marcas que pueden invertir el texto', () => {
    expect(sourceFileName('  Estado\r\n\u202E.pdf\u0000  ')).toBe('Estado.pdf');
  });

  it('normaliza unicode y limita caracteres sin cortar pares sustitutos', () => {
    expect(sourceFileName('sinte\u0301tico.pdf')).toBe('sintético.pdf');
    expect(Array.from(sourceFileName('😀'.repeat(300)) ?? '')).toHaveLength(255);
  });

  it.each(['', '   ', '..', '/'])('no inventa nombres para etiquetas vacías: %s', (name) => {
    expect(sourceFileName(name)).toBeNull();
  });
});
