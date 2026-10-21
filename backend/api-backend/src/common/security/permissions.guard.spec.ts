import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { OrganizationContext } from '../http/request-context';
import { PermissionsGuard, RequirePermissions } from './permissions.guard';

class Rutas {
  @RequirePermissions('USERS_MANAGE')
  gestionar(): void {}

  libre(): void {}
}

function contexto(
  handler: () => void,
  organization?: Partial<OrganizationContext>,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => Rutas,
    switchToHttp: () => ({ getRequest: () => ({ organization }) }),
  } as unknown as ExecutionContext;
}

const PERSONA: OrganizationContext = {
  organizationId: 'org',
  apiKeyId: null,
  userId: 'persona',
  role: 'MEMBER',
  permissions: ['STATEMENTS_CONVERT'],
  plan: null,
};

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());
  const rutas = new Rutas();

  it('deja pasar una ruta que no exige permisos', () => {
    expect(guard.canActivate(contexto(rutas.libre, PERSONA))).toBe(true);
  });

  it('exige el permiso del rol, no el nombre del rol', () => {
    expect(() => guard.canActivate(contexto(rutas.gestionar, PERSONA))).toThrow(ForbiddenException);
    // Un rol nuevo con el permiso pasa sin tocar código: es lo que da el catálogo.
    expect(
      guard.canActivate(
        contexto(rutas.gestionar, { ...PERSONA, role: 'SOPORTE', permissions: ['USERS_MANAGE'] }),
      ),
    ).toBe(true);
  });

  it('responde con el mismo código que antes de los permisos', () => {
    try {
      guard.canActivate(contexto(rutas.gestionar, PERSONA));
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toEqual({ code: 'INSUFFICIENT_ROLE' });
    }
    expect(() => guard.canActivate(contexto(rutas.gestionar))).toThrow(ForbiddenException);
  });

  it('una credencial de servicio representa a la organización y pasa', () => {
    expect(
      guard.canActivate(
        contexto(rutas.gestionar, { ...PERSONA, apiKeyId: 'clave', userId: null, permissions: [] }),
      ),
    ).toBe(true);
  });
});
