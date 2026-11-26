import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type CommercialProduct } from '@prisma/client';

import { centsToDecimal, decimalToCents } from '../../common/money/cents';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CotizacionInvalida,
  PRODUCT_CODE_PATTERN,
  cotizar,
  formaDePrecioValida,
  type Cotizacion,
  type Pricing,
  type ProductoCotizable,
} from './commercial-pricing';
import type { CreateCommercialProductDto, UpdateCommercialProductDto } from './dto/commercial.dto';

export type CommercialProductOption = ProductoCotizable & { description: string };

export interface CommercialProductAdminOption extends CommercialProductOption {
  isActive: boolean;
  sortOrder: number;
}

const ORDEN = [
  { sortOrder: 'asc' },
  { code: 'asc' },
] satisfies Prisma.CommercialProductOrderByWithRelationInput[];

function aOpcion(producto: CommercialProduct): CommercialProductOption {
  return {
    code: producto.code,
    name: producto.name,
    description: producto.description,
    pricing: producto.pricing,
    pageQuantity: producto.pageQuantity,
    minimumPages: producto.minimumPages,
    priceCents: decimalToCents(producto.price),
    currency: producto.currency,
    validityDays: producto.validityDays,
  };
}

function aOpcionAdmin(producto: CommercialProduct): CommercialProductAdminOption {
  return { ...aOpcion(producto), isActive: producto.isActive, sortOrder: producto.sortOrder };
}

/**
 * Catálogo de productos de saldo: Recargas y los paquetes Profesional (ADR-0019).
 *
 * Vive aparte de `membership_plans` porque no es la identidad de la cuenta sino
 * compras que se apilan. Aquí solo hay catálogo y cotización: registrar una
 * compra y consumir su saldo llega con los lotes de páginas.
 */
@Injectable()
export class CommercialService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lo que se ofrece hoy, en el orden en que se ofrece. */
  async listActive(): Promise<CommercialProductOption[]> {
    const productos = await this.prisma.commercialProduct.findMany({
      where: { isActive: true },
      orderBy: ORDEN,
    });
    return productos.map(aOpcion);
  }

  /** Todo el catálogo, activo o retirado, para administrarlo. */
  async listForAdmin(): Promise<CommercialProductAdminOption[]> {
    const productos = await this.prisma.commercialProduct.findMany({ orderBy: ORDEN });
    return productos.map(aOpcionAdmin);
  }

  /**
   * Precio de una compra, con el paquete que convenga más si lo hay. Solo de
   * productos activos: lo retirado no se vende, ni siquiera para cotizar.
   */
  async quote(code: string, pages: number | undefined): Promise<Cotizacion> {
    const activos = await this.listActive();
    const producto = activos.find((candidato) => candidato.code === code);
    if (!producto) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    }
    try {
      return cotizar(producto, pages, activos);
    } catch (error) {
      if (error instanceof CotizacionInvalida) {
        throw new BadRequestException({ code: error.code });
      }
      throw error;
    }
  }

  /**
   * `PRODUCT_ALREADY_EXISTS` si el código ya está en uso, aunque esté retirado:
   * los códigos no se reutilizan, igual que en las membresías (ADR-0016).
   */
  async create(datos: CreateCommercialProductDto): Promise<CommercialProductAdminOption> {
    const pricing = datos.pricing as Pricing;
    const pageQuantity = datos.pageQuantity ?? null;
    const minimumPages = datos.minimumPages ?? null;
    if (!formaDePrecioValida(pricing, pageQuantity, minimumPages)) {
      throw new BadRequestException({ code: 'PRODUCT_PRICING_SHAPE_INVALID' });
    }
    const existente = await this.prisma.commercialProduct.findUnique({
      where: { code: datos.code },
      select: { code: true },
    });
    if (existente) {
      throw new ConflictException({ code: 'PRODUCT_ALREADY_EXISTS' });
    }
    const creado = await this.prisma.commercialProduct.create({
      data: {
        code: datos.code,
        name: datos.name,
        description: datos.description,
        pricing,
        pageQuantity,
        minimumPages,
        price: centsToDecimal(datos.priceCents),
        validityDays: datos.validityDays,
        isActive: datos.isActive ?? true,
        sortOrder: datos.sortOrder ?? 0,
      },
    });
    return aOpcionAdmin(creado);
  }

  /** `PRODUCT_NOT_FOUND` si no existe. Solo escribe lo que se envía. */
  async update(
    code: string,
    cambios: UpdateCommercialProductDto,
  ): Promise<CommercialProductAdminOption> {
    const existente = PRODUCT_CODE_PATTERN.test(code)
      ? await this.prisma.commercialProduct.findUnique({ where: { code } })
      : null;
    if (!existente) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    }
    const pricing = existente.pricing;
    const pageQuantity = cambios.pageQuantity ?? existente.pageQuantity;
    const minimumPages = cambios.minimumPages ?? existente.minimumPages;
    if (!formaDePrecioValida(pricing, pageQuantity, minimumPages)) {
      throw new BadRequestException({ code: 'PRODUCT_PRICING_SHAPE_INVALID' });
    }

    const datos: Prisma.CommercialProductUpdateInput = {};
    if (cambios.name !== undefined) datos.name = cambios.name;
    if (cambios.description !== undefined) datos.description = cambios.description;
    if (cambios.pageQuantity !== undefined) datos.pageQuantity = cambios.pageQuantity;
    if (cambios.minimumPages !== undefined) datos.minimumPages = cambios.minimumPages;
    if (cambios.priceCents !== undefined) datos.price = centsToDecimal(cambios.priceCents);
    if (cambios.validityDays !== undefined) datos.validityDays = cambios.validityDays;
    if (cambios.isActive !== undefined) datos.isActive = cambios.isActive;
    if (cambios.sortOrder !== undefined) datos.sortOrder = cambios.sortOrder;

    if (Object.keys(datos).length === 0) {
      return aOpcionAdmin(existente);
    }
    const actualizado = await this.prisma.commercialProduct.update({
      where: { code },
      data: datos,
    });
    return aOpcionAdmin(actualizado);
  }
}
