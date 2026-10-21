import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/http/request-context';
import { PermissionsGuard, RequirePermissions } from '../../common/security/permissions.guard';
import { SessionGuard } from '../../common/security/session.guard';
import type { AppConfig } from '../../config/app-config';
import type { AuthenticatedUser } from '../auth/auth.service';
import { PERMISSION } from './access-catalog';
import { AccessService } from './access.service';
import { PlanDto, RoleDto, SupportContactDto } from './dto/access.dto';

@ApiTags('access')
@Controller()
export class AccessController {
  constructor(
    private readonly access: AccessService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Cualquier persona con sesión puede verlas: la interfaz explica con ellas qué
   * añade otra membresía. No incluyen quién tiene cada una.
   */
  @Get('plans')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Membresías disponibles, con sus límites y funciones' })
  @ApiResponse({ status: 200, type: [PlanDto] })
  async plans(): Promise<PlanDto[]> {
    return this.access.listPlans();
  }

  /** Solo los que quien pregunta puede asignar: de rango igual o inferior al suyo. */
  @Get('roles')
  @UseGuards(SessionGuard, PermissionsGuard)
  @RequirePermissions(PERMISSION.USERS_MANAGE)
  @ApiOperation({ summary: 'Roles que puede asignar quien consulta, con sus permisos' })
  @ApiResponse({ status: 200, type: [RoleDto] })
  async roles(@CurrentUser() actor: AuthenticatedUser): Promise<RoleDto[]> {
    return this.access.listAssignableRoles(actor.roleRank);
  }

  /**
   * Pública: un error al entrar también tiene que decir a quién llamar. Solo
   * expone el teléfono que la organización decidió publicar en `SUPPORT_PHONE`.
   */
  @Get('support')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({ summary: 'Contacto de soporte para los avisos de error' })
  @ApiResponse({ status: 200, type: SupportContactDto })
  support(): SupportContactDto {
    const phone = this.config.get('SUPPORT_PHONE', { infer: true }).trim();
    return { phone: phone === '' ? null : phone };
  }
}
