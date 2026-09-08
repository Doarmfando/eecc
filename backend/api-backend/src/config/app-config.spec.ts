import { NodeEnvironment, parseCorsOrigins, validateConfig } from './app-config';

const BASE = {
  DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/eecc',
  FINGERPRINT_SECRET: 's'.repeat(48),
};

describe('validateConfig', () => {
  it('aplica valores por defecto conservadores', () => {
    const config = validateConfig({ ...BASE });

    expect(config.NODE_ENV).toEqual(NodeEnvironment.Development);
    expect(config.PORT).toEqual(3000);
    expect(config.MAX_UPLOAD_BYTES).toEqual(52428800);
    expect(config.WORKER_BASE_URL).toEqual('http://127.0.0.1:8000');
  });

  it('convierte los valores numéricos que llegan como texto', () => {
    const config = validateConfig({ ...BASE, PORT: '8080', MAX_UPLOAD_BYTES: '2048' });

    expect(config.PORT).toEqual(8080);
    expect(config.MAX_UPLOAD_BYTES).toEqual(2048);
  });

  it('falla cuando falta un valor obligatorio o queda fuera de rango', () => {
    expect(() => validateConfig({ FINGERPRINT_SECRET: 's'.repeat(48) })).toThrow(/DATABASE_URL/);
    expect(() => validateConfig({ ...BASE, FINGERPRINT_SECRET: 'corto' })).toThrow(
      /FINGERPRINT_SECRET/,
    );
    expect(() => validateConfig({ ...BASE, PORT: '0' })).toThrow(/PORT/);
    expect(() => validateConfig({ ...BASE, WORKER_BASE_URL: 'ftp://interno' })).toThrow(
      /WORKER_BASE_URL/,
    );
  });

  it('no expone secretos en el mensaje de error', () => {
    try {
      validateConfig({ ...BASE, FINGERPRINT_SECRET: 'secreto-corto' });
      fail('debía fallar');
    } catch (error) {
      expect((error as Error).message).not.toContain('secreto-corto');
    }
  });
});

describe('parseCorsOrigins', () => {
  it('acepta una lista explícita y descarta entradas vacías', () => {
    expect(parseCorsOrigins('http://localhost:5173, https://app.ejemplo.pe ')).toEqual([
      'http://localhost:5173',
      'https://app.ejemplo.pe',
    ]);
  });

  it('devuelve una lista vacía cuando no hay orígenes configurados', () => {
    expect(parseCorsOrigins('')).toEqual([]);
    expect(parseCorsOrigins('   ,  ')).toEqual([]);
  });
});
