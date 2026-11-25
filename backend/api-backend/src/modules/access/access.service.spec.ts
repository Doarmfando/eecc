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
      planExpiryRequired: true,
      permissions: [{ permissionCode: 'STATEMENTS_CONVERT' }],
    },
  ]);
  const prisma = {
    membershipPlan: { findMany: jest.fn().mockResolvedValue(planes), findFirst: planFindFirst },
    role: {
      findMany: roleFindMany,
      findUnique: jest.fn(({ where }: { where: { code: string } }) =>
        Promise.resolve(
          where.code === 'ADMIN'
            ? { code: 'ADMIN', rank: 50, defaultPlanCode: 'ATLAS', planExpiryRequired: false }
            : null,
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
      planExpiryRequired: true,
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
      planExpiryRequired: false,
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

describe('AccessService: administrar el catálogo de planes (ADR-0018)', () => {
  function servicioAdmin(planExistente: Record<string, unknown> | null = null): {
    service: AccessService;
    planCreado: jest.Mock;
    planActualizado: jest.Mock;
    featuresCreadas: jest.Mock;
    featuresBorradas: jest.Mock;
  } {
    const planCreado = jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ code: args.data.code as string, ...args.data }),
    );
    const planActualizado = jest.fn().mockResolvedValue({});
    const featuresCreadas = jest.fn().mockResolvedValue({ count: 1 });
    const featuresBorradas = jest.fn().mockResolvedValue({ count: 1 });
    const planFinal = {
      code: 'PRO',
      name: 'Pro',
      description: 'd',
      maxRetainedStatements: 10,
      maxPagesPerDocument: 1000,
      monthlyPageQuota: 100,
      trialOneTime: false,
      isDefault: false,
      isActive: true,
      sortOrder: 15,
      features: [{ featureCode: 'HISTORY' }],
    };

    const prisma = {
      membershipPlan: {
        findUnique: jest.fn().mockResolvedValue(planExistente),
        findUniqueOrThrow: jest.fn().mockResolvedValue(planFinal),
        findMany: jest.fn().mockResolvedValue([planFinal]),
        create: planCreado,
        update: planActualizado,
      },
      planFeature: { createMany: featuresCreadas, deleteMany: featuresBorradas },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          membershipPlan: { create: planCreado, update: planActualizado },
          planFeature: { createMany: featuresCreadas, deleteMany: featuresBorradas },
        }),
      ),
    } as unknown as PrismaService;
    return {
      service: new AccessService(prisma),
      planCreado,
      planActualizado,
      featuresCreadas,
      featuresBorradas,
    };
  }

  it('crea un plan nuevo con sus funciones, con los valores por defecto documentados', async () => {
    const { service, planCreado, featuresCreadas } = servicioAdmin();

    const creado = await service.createPlan({
      code: 'PRO',
      name: 'Pro',
      description: 'Conversión e historial, 10 documentos y hasta 100 páginas por PDF.',
      maxRetainedStatements: 10,
      monthlyPageQuota: 100,
      features: ['HISTORY'],
    });

    expect(planCreado).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'PRO',
          maxPagesPerDocument: 1000,
          trialOneTime: false,
          isDefault: false,
          isActive: true,
          sortOrder: 0,
        }),
      }),
    );
    expect(featuresCreadas).toHaveBeenCalledWith({
      data: [{ planCode: 'PRO', featureCode: 'HISTORY' }],
    });
    expect(creado.code).toBe('PRO');
    expect(creado.features).toEqual(['HISTORY']);
  });

  it('no deja crear un plan con un código que ya existe, ni siquiera retirado', async () => {
    const { service, planCreado } = servicioAdmin({ code: 'PRO' });

    await expect(
      service.createPlan({
        code: 'PRO',
        name: 'Pro',
        description: 'd',
        maxRetainedStatements: 10,
      }),
    ).rejects.toMatchObject({ response: { code: 'PLAN_ALREADY_EXISTS' } });
    expect(planCreado).not.toHaveBeenCalled();
  });

  it('actualiza solo lo que se envía y reemplaza la lista de funciones completa', async () => {
    const { service, planActualizado, featuresBorradas, featuresCreadas } = servicioAdmin({
      code: 'PRO',
    });

    await service.updatePlan('PRO', { monthlyPageQuota: 200, features: ['FINANCIAL_CENTER'] });

    expect(planActualizado).toHaveBeenCalledWith({
      where: { code: 'PRO' },
      data: { monthlyPageQuota: 200 },
    });
    expect(featuresBorradas).toHaveBeenCalledWith({ where: { planCode: 'PRO' } });
    expect(featuresCreadas).toHaveBeenCalledWith({
      data: [{ planCode: 'PRO', featureCode: 'FINANCIAL_CENTER' }],
    });
  });

  it('rechaza cambiar un plan que no existe', async () => {
    const { service } = servicioAdmin(null);

    await expect(service.updatePlan('NO_EXISTE', { name: 'x' })).rejects.toMatchObject({
      response: { code: 'PLAN_NOT_FOUND' },
    });
  });

  it('lista el catálogo completo para administrar, activo o retirado', async () => {
    const { service } = servicioAdmin();

    const planes = await service.listPlansForAdmin();

    expect(planes[0]).toMatchObject({ code: 'PRO', isActive: true, sortOrder: 15 });
  });
});
