import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveBlob } from './save-file';

const URL_TEMPORAL = 'blob:http://127.0.0.1/objeto-temporal';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn().mockReturnValue(URL_TEMPORAL),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('saveBlob', () => {
  it('entrega el archivo con el nombre pedido y sin abrir el documento al destino', () => {
    const clicks: HTMLAnchorElement[] = [];
    const clickOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function registrar(this: HTMLAnchorElement): void {
      clicks.push(this);
    };

    try {
      saveBlob(new Blob(['contenido']), 'estado.xlsx');
    } finally {
      HTMLAnchorElement.prototype.click = clickOriginal;
    }

    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.download).toBe('estado.xlsx');
    expect(clicks[0]?.getAttribute('href')).toBe(URL_TEMPORAL);
    // `noopener` evita que el destino obtenga una referencia a esta ventana.
    expect(clicks[0]?.rel).toBe('noopener');
  });

  it('no revoca el objeto en el mismo tick: eso cancelaría la descarga', () => {
    saveBlob(new Blob(['contenido']), 'estado.csv');

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(document.body.querySelector('a')).not.toBeNull();

    vi.runAllTimers();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith(URL_TEMPORAL);
    // Y no deja el elemento suelto en el documento.
    expect(document.body.querySelector('a')).toBeNull();
  });
});
