import { describe, expect, it } from 'vitest';

import { ApiError, describeError, describeErrorKind, errorCode } from '@/lib/api-error';
import { BASIC_USER, TEST_USER } from '@/test/render';

import {
  cupoDe,
  FEATURE,
  paginasAlMes,
  puedeGestionarCuentas,
  resumenDePlan,
  tieneFuncion,
} from './access';

/** Sesión de una API anterior a ADR-0016: sin permisos ni plan. */
const SESION_ANTIGUA = {
  userId: 'u',
  email: 'a@empresa.pe',
  displayName: 'A',
  organizationId: 'o',
  organizationName: 'O',
  role: 'ADMIN',
  retainedStatementsPerUser: 3,
};

describe('acceso según rol y membresía', () => {
  it('Básica solo convierte; Atlas tiene todas las vistas', () => {
    for (const funcion of Object.values(FEATURE)) {
      expect(tieneFuncion(BASIC_USER, funcion)).toBe(false);
      expect(tieneFuncion(TEST_USER, funcion)).toBe(true);
    }
    expect(tieneFuncion(null, FEATURE.HISTORY)).toBe(false);
  });

  it('gestiona cuentas quien tiene el permiso, no quien se llama ADMIN', () => {
    expect(puedeGestionarCuentas(TEST_USER)).toBe(true);
    expect(puedeGestionarCuentas(BASIC_USER)).toBe(false);
    expect(
      puedeGestionarCuentas({ ...BASIC_USER, role: 'SOPORTE', permissions: ['USERS_MANAGE'] }),
    ).toBe(true);
    expect(puedeGestionarCuentas(null)).toBe(false);
  });

  it('con una API anterior no bloquea vistas y deduce la gestión del rol', () => {
    expect(tieneFuncion(SESION_ANTIGUA, FEATURE.FINANCIAL_CENTER)).toBe(true);
    expect(puedeGestionarCuentas(SESION_ANTIGUA)).toBe(true);
    expect(cupoDe(SESION_ANTIGUA)).toBe(3);
    expect(paginasAlMes(SESION_ANTIGUA)).toBeNull();
  });

  it('lee el cupo de documentos de la sesión, el mismo para cualquier plan (ADR-0007)', () => {
    expect(cupoDe({ ...TEST_USER, retainedStatementsPerUser: 20 })).toBe(20);
    expect(paginasAlMes(BASIC_USER)).toBe(10);
    expect(cupoDe(null)).toBe(0);
  });

  it('resume un plan en una línea, solo por páginas (ADR-0018)', () => {
    expect(resumenDePlan({ monthlyPageQuota: 10 })).toBe('10 páginas acumuladas al mes');
    expect(resumenDePlan({ monthlyPageQuota: null })).toBe(
      'volumen de páginas a cotizar, sin tope fijo',
    );
    expect(resumenDePlan({ monthlyPageQuota: 3, trialOneTime: true })).toBe(
      '3 páginas de prueba, una sola vez',
    );
  });
});

describe('errores explicados para soporte', () => {
  it('dice cuántas páginas sobran cuando la API lo informa', () => {
    const conNumeros = new ApiError('PDF_PAGE_LIMIT_EXCEEDED', 422, 'r', undefined, {
      pageCount: 42,
      maxPages: 15,
    });
    expect(describeError(conNumeros)).toMatch(/42 páginas.*puedes convertir hasta 15/);
    expect(describeError(new ApiError('PDF_PAGE_LIMIT_EXCEEDED', 422))).toMatch(
      /más páginas de las que te quedan/,
    );
  });

  it('clasifica el tipo de error', () => {
    expect(describeErrorKind(new ApiError('INVALID_PDF', 422))).toBe('Documento');
    expect(describeErrorKind(new ApiError('PDF_PAGE_LIMIT_EXCEEDED', 422))).toBe(
      'Límite de la membresía',
    );
    expect(describeErrorKind(new ApiError('ROLE_ABOVE_YOURS', 403))).toBe('Permisos');
    expect(describeErrorKind(new ApiError('SESSION_EXPIRED', 401))).toBe('Sesión');
    expect(describeErrorKind(new ApiError('NETWORK_ERROR', 0))).toBe('Conexión');
    expect(describeErrorKind(new ApiError('WORKER_UNAVAILABLE', 502))).toBe('Servidor');
    expect(describeErrorKind(new ApiError('CODIGO_NUEVO', 400))).toBe('Datos enviados');
    expect(describeErrorKind(new Error('x'))).toBe('Servidor');
    expect(errorCode(new Error('x'))).toBe('UNEXPECTED_ERROR');
  });
});
