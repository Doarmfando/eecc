import { describe, expect, it } from 'vitest';

import { readBaseUrl } from './env';

describe('readBaseUrl', () => {
  it('usa el origen configurado cuando existe', () => {
    expect(readBaseUrl({ VITE_API_BASE_URL: 'https://api.ejemplo.pe' })).toBe(
      'https://api.ejemplo.pe',
    );
  });

  it('cae al valor local cuando la variable falta o está vacía', () => {
    expect(readBaseUrl({})).toBe('http://127.0.0.1:3000');
    expect(readBaseUrl({ VITE_API_BASE_URL: '   ' })).toBe('http://127.0.0.1:3000');
  });
});
