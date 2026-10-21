import { describe, expect, it } from 'vitest';

import { ApiError, describeError, describeErrorKind, errorCode } from '@/lib/api-error';
import { BASIC_USER, TEST_USER } from '@/test/render';

import {
  cupoDe,
  FEATURE,
  paginasPorDocumento,
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
    expect(paginasPorDocumento(SESION_ANTIGUA)).toBeNull();
  });

  it('lee los límites del plan', () => {
    expect(cupoDe({ ...TEST_USER, plan: { ...BASIC_USER.plan!, maxRetainedStatements: 20 } })).toBe(
      20,
    );
    expect(paginasPorDocumento(BASIC_USER)).toBe(15);
    expect(cupoDe(null)).toBe(0);
  });

  it('resume un plan en una línea', () => {
    expect(resumenDePlan({ maxRetainedStatements: 3, maxPagesPerDocument: 15 })).toBe(
      '3 documentos guardados · hasta 15 páginas por PDF',
    );
    expect(resumenDePlan({ maxRetainedStatements: 1, maxPagesPerDocument: null })).toBe(
      '1 documento guardado · sin límite de páginas',
    );
  });
});

describe('errores explicados para soporte', () => {
  it('dice cuántas páginas sobran cuando la API lo informa', () => {
    const conNumeros = new ApiError('PDF_PAGE_LIMIT_EXCEEDED', 422, 'r', undefined, {
      pageCount: 42,
      maxPages: 15,
    });
    expect(describeError(conNumeros)).toMatch(/42 páginas.*hasta 15 por documento/);
    expect(describeError(new ApiError('PDF_PAGE_LIMIT_EXCEEDED', 422))).toMatch(
      /más páginas de las que admite tu membresía/,
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
