import { Prisma, type CommercialProduct } from '@prisma/client';

import type { PrismaService } from '../../common/prisma/prisma.service';
import { CommercialService } from './commercial.service';

const AHORA = new Date('2026-11-26T15:00:00Z');

function fila(datos: Partial<CommercialProduct> & { code: string }): CommercialProduct {
  return {
    name: datos.code,
    description: 'd',
    pricing: 'PACKAGE',
    pageQuantity: 500,
    minimumPages: null,
    price: new Prisma.Decimal('29.90'),
    currency: 'PEN',
    validityDays: 90,
    isActive: true,
    sortOrder: 0,
    createdAt: AHORA,
    updatedAt: AHORA,
    ...datos,
  };
}

const RECARGA = fila({
  code: 'RECARGA',
  pricing: 'PER_PAGE',
  pageQuantity: null,
  minimumPages: 20,
  price: new Prisma.Decimal('0.15'),
  sortOrder: 10,
});
const P500 = fila({ code: 'PROFESIONAL_500', sortOrder: 20 });
const RETIRADO = fila({ code: 'VIEJO', isActive: false, price: new Prisma.Decimal('1.00') });

function servicio(filas: CommercialProduct[] = [RECARGA, P500, RETIRADO]): {
  service: CommercialService;
  create: jest.Mock;
  update: jest.Mock;
  findMany: jest.Mock;
} {
  const findMany = jest.fn(({ where }: { where?: { isActive?: boolean } } = {}) =>
    Promise.resolve(filas.filter((producto) => where?.isActive === undefined || producto.isActive)),
  );
  const create = jest.fn(({ data }: { data: Partial<CommercialProduct> & { code: string } }) =>
    Promise.resolve(fila(data)),
  );
  const update = jest.fn(
    ({ where, data }: { where: { code: string }; data: Partial<CommercialProduct> }) =>
      Promise.resolve({ ...filas.find((producto) => producto.code === where.code), ...data }),
  );
  const prisma = {
    commercialProduct: {
      findMany,
      findUnique: jest.fn(({ where }: { where: { code: string } }) =>
        Promise.resolve(filas.find((producto) => producto.code === where.code) ?? null),
      ),
      create,
      update,
    },
  } as unknown as PrismaService;
  return { service: new CommercialService(prisma), create, update, findMany };
}

describe('CommercialService', () => {
  it('ofrece solo lo activo, con el precio en céntimos exactos', async () => {
    const { service } = servicio();

    const productos = await service.listActive();

    expect(productos.map((producto) => producto.code)).toEqual(['RECARGA', 'PROFESIONAL_500']);
    expect(productos[0]).toEqual({
      code: 'RECARGA',
      name: 'RECARGA',
      description: 'd',
      pricing: 'PER_PAGE',
      pageQuantity: null,
      minimumPages: 20,
      priceCents: 15,
      currency: 'PEN',
      validityDays: 90,
    });
  });

  it('para administrar lista también lo retirado, con su estado y orden', async () => {
    const { service } = servicio();

    const productos = await service.listForAdmin();

    expect(productos.find((producto) => producto.code === 'VIEJO')).toMatchObject({
      isActive: false,
      priceCents: 100,
    });
  });

  it('cotiza una recarga y sugiere el paquete cuando conviene', async () => {
    const { service } = servicio();

    await expect(service.quote('RECARGA', 200)).resolves.toMatchObject({
      pages: 200,
      priceCents: 3000,
      suggestion: { productCode: 'PROFESIONAL_500', savingsCents: 10 },
    });
  });

  it('no cotiza un producto retirado ni uno que no existe', async () => {
    const { service } = servicio();

    await expect(service.quote('VIEJO', undefined)).rejects.toMatchObject({
      response: { code: 'PRODUCT_NOT_FOUND' },
    });
    await expect(service.quote('NADA', undefined)).rejects.toMatchObject({
      response: { code: 'PRODUCT_NOT_FOUND' },
    });
  });

  it('una recarga bajo el mínimo responde con un código claro', async () => {
    const { service } = servicio();

    await expect(service.quote('RECARGA', 5)).rejects.toMatchObject({
      status: 400,
      response: { code: 'QUANTITY_BELOW_MINIMUM' },
    });
  });

  it('crea un paquete con el precio en soles exactos', async () => {
    const { service, create } = servicio();

    const creado = await service.create({
      code: 'PROFESIONAL_10000',
      name: 'ATLAS Profesional 10000',
      description: 'd',
      pricing: 'PACKAGE',
      pageQuantity: 10000,
      priceCents: 12990,
      validityDays: 90,
    });

    const { data } = create.mock.calls[0]?.[0] as { data: { price: Prisma.Decimal } };
    expect(data.price.toFixed(2)).toBe('129.90');
    expect(data).toMatchObject({ minimumPages: null, isActive: true, sortOrder: 0 });
    expect(creado.priceCents).toBe(12990);
  });

  it('no crea un producto con un código ya usado, aunque esté retirado', async () => {
    const { service, create } = servicio();

    await expect(
      service.create({
        code: 'VIEJO',
        name: 'x',
        description: 'd',
        pricing: 'PACKAGE',
        pageQuantity: 10,
        priceCents: 100,
        validityDays: 90,
      }),
    ).rejects.toMatchObject({ response: { code: 'PRODUCT_ALREADY_EXISTS' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('no crea un paquete sin cantidad ni una recarga sin mínimo', async () => {
    const { service, create } = servicio();
    const base = { name: 'x', description: 'd', priceCents: 100, validityDays: 90 };

    await expect(
      service.create({ ...base, code: 'A_B', pricing: 'PACKAGE' }),
    ).rejects.toMatchObject({ response: { code: 'PRODUCT_PRICING_SHAPE_INVALID' } });
    await expect(
      service.create({ ...base, code: 'C_D', pricing: 'PER_PAGE', pageQuantity: 50 }),
    ).rejects.toMatchObject({ response: { code: 'PRODUCT_PRICING_SHAPE_INVALID' } });
    expect(create).not.toHaveBeenCalled();
  });

  it('cambia solo lo que se envía', async () => {
    const { service, update } = servicio();

    const cambiado = await service.update('RECARGA', { priceCents: 12, minimumPages: 25 });

    const { data } = update.mock.calls[0]?.[0] as {
      data: { price: Prisma.Decimal; minimumPages: number };
    };
    expect(Object.keys(data).sort()).toEqual(['minimumPages', 'price']);
    expect(data.price.toFixed(2)).toBe('0.12');
    expect(cambiado).toMatchObject({ priceCents: 12, minimumPages: 25 });
  });

  it('no deja poner una cantidad de paquete a una recarga', async () => {
    const { service, update } = servicio();

    await expect(service.update('RECARGA', { pageQuantity: 100 })).rejects.toMatchObject({
      response: { code: 'PRODUCT_PRICING_SHAPE_INVALID' },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('rechaza cambiar un producto que no existe', async () => {
    const { service } = servicio();

    await expect(service.update('NO_EXISTE', { name: 'x' })).rejects.toMatchObject({
      status: 404,
      response: { code: 'PRODUCT_NOT_FOUND' },
    });
    await expect(service.update('minusculas', { name: 'x' })).rejects.toMatchObject({
      response: { code: 'PRODUCT_NOT_FOUND' },
    });
  });

  it('sin cambios no escribe nada', async () => {
    const { service, update } = servicio();

    await expect(service.update('PROFESIONAL_500', {})).resolves.toMatchObject({
      code: 'PROFESIONAL_500',
    });
    expect(update).not.toHaveBeenCalled();
  });
});
