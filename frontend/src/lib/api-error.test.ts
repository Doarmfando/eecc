import { describe, expect, it } from 'vitest';

import { ApiError, describeError, isRetriable } from './api-error';

describe('describeError', () => {
  it('traduce los códigos conocidos del contrato', () => {
    expect(describeError(new ApiError('SESSION_EXPIRED', 401))).toContain('sesión');
    expect(describeError(new ApiError('UNSUPPORTED_DOCUMENT', 422))).toContain('estado de cuenta');
    expect(describeError(new ApiError('WORKER_UNAVAILABLE', 502))).toContain('no está disponible');
    expect(describeError(new ApiError('ARTIFACT_NOT_FOUND', 404))).toContain('descargar');
    expect(describeError(new ApiError('INVALID_CURSOR', 400))).toContain('historial');
  });

  it('no inventa un mensaje para un código nuevo ni para un error ajeno', () => {
    expect(describeError(new ApiError('CODIGO_FUTURO', 400))).toContain('inesperado');
    expect(describeError(new Error('boom'))).toContain('inesperado');
    expect(describeError('texto suelto')).toContain('inesperado');
  });
});

describe('isRetriable', () => {
  it('solo reintenta fallos de servidor o de red', () => {
    expect(isRetriable(new ApiError('WORKER_UNAVAILABLE', 502))).toBe(true);
    expect(isRetriable(new ApiError('NETWORK_ERROR', 0))).toBe(true);
  });

  it('no reintenta credenciales, validación ni contratos incompatibles', () => {
    expect(isRetriable(new ApiError('SESSION_EXPIRED', 401))).toBe(false);
    expect(isRetriable(new ApiError('UNSUPPORTED_DOCUMENT', 422))).toBe(false);
    expect(isRetriable(new ApiError('RESPONSE_CONTRACT_MISMATCH', 200))).toBe(false);
    expect(isRetriable(new Error('boom'))).toBe(false);
  });
});
