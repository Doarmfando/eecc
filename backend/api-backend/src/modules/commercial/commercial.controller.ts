import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { PermissionsGuard, RequirePermissions } from '../../common/security/permissions.guard';
import { SessionGuard } from '../../common/security/session.guard';
import { PERMISSION } from '../access/access-catalog';
import { CommercialService } from './commercial.service';
import {
  CommercialProductAdminDto,
  CommercialProductDto,
  CreateCommercialProductDto,
  QuoteDto,
  QuoteQueryDto,
  UpdateCommercialProductDto,
} from './dto/commercial.dto';

@ApiTags('commercial')
@Controller('commercial-products')
export class CommercialController {
  constructor(private readonly commercial: CommercialService) {}

  /** Cualquier persona con sesión: la interfaz ofrece con esto Recargas y Profesional. */
  @Get()
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Productos de saldo que se ofrecen hoy, con su precio' })
  @ApiResponse({ status: 200, type: [CommercialProductDto] })
  async list(): Promise<CommercialProductDto[]> {
    return this.commercial.listActive();
  }

  /** Antes de `:code/quote` y `PATCH :code`, para que no choquen de ruta. */
  @Get('admin')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions(PERMISSION.PLANS_MANAGE)
  @ApiOperation({ summary: 'Todo el catálogo de productos de saldo, activo o retirado' })
  @ApiResponse({ status: 200, type: [CommercialProductAdminDto] })
  async listForAdmin(): Promise<CommercialProductAdminDto[]> {
    return this.commercial.listForAdmin();
  }

  /**
   * Cuánto cuesta una compra y si conviene un paquete. No registra nada: la compra
   * la registra un administrador al confirmar el pago (ADR-0019).
   */
  @Get(':code/quote')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Cotiza una compra de páginas' })
  @ApiResponse({ status: 200, type: QuoteDto })
  async quote(@Param('code') code: string, @Query() query: QuoteQueryDto): Promise<QuoteDto> {
    return this.commercial.quote(code, query.pages);
  }

  @Post()
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions(PERMISSION.PLANS_MANAGE)
  @ApiOperation({ summary: 'Crea un producto de saldo' })
  @ApiResponse({ status: 201, type: CommercialProductAdminDto })
  async create(@Body() datos: CreateCommercialProductDto): Promise<CommercialProductAdminDto> {
    return this.commercial.create(datos);
  }

  /** Precio, páginas, vigencia o si se ofrece; solo lo que se envía. */
  @Patch(':code')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions(PERMISSION.PLANS_MANAGE)
  @ApiOperation({ summary: 'Cambia un producto de saldo' })
  @ApiResponse({ status: 200, type: CommercialProductAdminDto })
  async update(
    @Param('code') code: string,
    @Body() cambios: UpdateCommercialProductDto,
  ): Promise<CommercialProductAdminDto> {
    return this.commercial.update(code, cambios);
  }
}
