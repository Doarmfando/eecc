import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';

const BASICA = {
  code: 'BASICA',
  name: 'Básica',
  description: 'Solo conversión',
  maxRetainedStatements: 3,
  maxPagesPerDocument: 15,
  isDefault: true,
  features: [],
};
const ATLAS = {
  code: 'ATLAS',
  name: 'Atlas',
  description: 'Todo',
  maxRetainedStatements: 20,
  maxPagesPerDocument: null,
  isDefault: false,
  features: [{ featureCode: 'HISTORY' }],
};

function servicio(planes = [BASICA, ATLAS]): {
  service: AccessService;
  roleFindMany: jest.Mock;
  planFindFirst: jest.Mock;
} {
  const planFindFirst = jest.fn(({ where }: { where: { code?: string; isActive?: boolean } }) => {
    const candidatos = planes.filter(
      (plan) => where.code === undefined || plan.code === where.code,
    );
    const predeterminado = candidatos.find((plan) => plan.isDefault) ?? candidatos[0];
    return Promise.resolve(predeterminado ? { code: predeterminado.code } : null);
  });
  const roleFindMany = jest.fn().mockResolvedValue([
    {
      code: 'MEMBER',
      name: 'Usuario',
      description: 'd',
      rank: 10,
      defaultPlanCode: null,
      permissions: [{ permissionCode: 'STATEMENTS_CONVERT' }],
    },
  ]);
  const prisma = {
    membershipPlan: { findMany: jest.fn().mockResolvedValue(planes), findFirst: planFindFirst },
    role: {
      findMany: roleFindMany,
      findUnique: jest.fn(({ where }: { where: { code: string } }) =>
        Promise.resolve(
          where.code === 'ADMIN' ? { code: 'ADMIN', rank: 50, defaultPlanCode: 'ATLAS' } : null,
        ),
      ),
    },
  } as unknown as PrismaService;
  return { service: new AccessService(prisma), roleFindMany, planFindFirst };
}

describe('AccessService', () => {
  it('lista las membresías con sus límites y funciones', async () => {
    const { service } = servicio();

    const planes = await service.listPlans();

    expect(planes[1]).toEqual({
      code: 'ATLAS',
      name: 'Atlas',
      description: 'Todo',
      maxRetainedStatements: 20,
      maxPagesPerDocument: null,
      isDefault: false,
      features: ['HISTORY'],
    });
  });

  it('solo ofrece los roles de rango igual o inferior al de quien pregunta', async () => {
    const { service, roleFindMany } = servicio();

    const roles = await service.listAssignableRoles(50);

    expect(roleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { rank: { lte: 50 } } }),
    );
    expect(roles[0]).toEqual({
      code: 'MEMBER',
      name: 'Usuario',
      description: 'd',
      rank: 10,
      defaultPlanCode: null,
      permissions: ['STATEMENTS_CONVERT'],
    });
  });

  it('elige el plan indicado, el que propone el rol o el predeterminado, en ese orden', async () => {
    const { service } = servicio();

    await expect(service.resolvePlanCode('ATLAS')).resolves.toBe('ATLAS');
    await expect(service.resolvePlanCode(undefined, undefined, 'ATLAS')).resolves.toBe('ATLAS');
    await expect(service.resolvePlanCode()).resolves.toBe('BASICA');
    // Un plan sugerido que ya no existe no bloquea el alta: cae al predeterminado.
    await expect(service.resolvePlanCode(undefined, undefined, 'RETIRADO')).resolves.toBe('BASICA');
  });

  it('conserva un plan retirado a quien ya lo tiene, pero no lo asigna a nadie más', async () => {
    const { service } = servicio([BASICA]);

    await expect(service.resolvePlanCode('ANTIGUO', 'ANTIGUO')).resolves.toBe('ANTIGUO');
    await expect(service.resolvePlanCode('ANTIGUO')).rejects.toMatchObject({
      response: { code: 'PLAN_NOT_FOUND' },
    });
    await expect(service.resolvePlanCode('no válido')).rejects.toMatchObject({
      response: { code: 'PLAN_NOT_FOUND' },
    });
  });

  it('sin ningún plan activo no inventa uno', async () => {
    const { service } = servicio([]);
    await expect(service.resolvePlanCode()).rejects.toMatchObject({
      response: { code: 'PLAN_NOT_FOUND' },
    });
  });

  it('encuentra un rol con su rango y rechaza los que no existen', async () => {
    const { service } = servicio();

    await expect(service.findRole('ADMIN')).resolves.toEqual({
      code: 'ADMIN',
      rank: 50,
      defaultPlanCode: 'ATLAS',
    });
    await expect(service.findRole('AUDITOR')).rejects.toMatchObject({
      response: { code: 'ROLE_NOT_FOUND' },
    });
    await expect(service.findRole('minúsculas')).rejects.toMatchObject({
      response: { code: 'ROLE_NOT_FOUND' },
    });
  });
});

describe('AccessController.support', () => {
  function controlador(telefono: string): AccessController {
    const config = { get: (): string => telefono } as unknown as ConfigService<AppConfig, true>;
    return new AccessController({} as AccessService, config);
  }

  it('publica el teléfono de soporte configurado', () => {
    expect(controlador(' +51 999 888 777 ').support()).toEqual({ phone: '+51 999 888 777' });
  });

  it('sin teléfono configurado responde nulo, no una cadena vacía', () => {
    expect(controlador('').support()).toEqual({ phone: null });
  });
});
