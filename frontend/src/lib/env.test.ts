import { describe, expect, it } from 'vitest';

import { readBaseUrl } from './env';

describe('readBaseUrl', () => {
  it('usa el origen configurado cuando existe', () => {
    expect(readBaseUrl({ VITE_API_BASE_URL: 'https://api.ejemplo.pe' })).toBe(
      'https://api.ejemplo.pe',
    );
  });

  it('cae al mismo origen que la página cuando la variable falta o está vacía', () => {
    // Cadena vacía significa "rutas relativas": en desarrollo las sirve el proxy de
    // Vite y en despliegue el mismo dominio, que es lo que permite la cookie de sesión.
    expect(readBaseUrl({})).toBe('');
    expect(readBaseUrl({ VITE_API_BASE_URL: '   ' })).toBe('');
  });
});
