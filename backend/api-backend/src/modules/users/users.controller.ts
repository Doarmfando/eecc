import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser, type RequestWithContext } from '../../common/http/request-context';
import { PermissionsGuard, RequirePermissions } from '../../common/security/permissions.guard';
import { SessionGuard } from '../../common/security/session.guard';
import { PERMISSION } from '../access/access-catalog';
import type { AuthenticatedUser } from '../auth/auth.service';
import type { MemberActor } from './users.service';
import {
  CreateMemberDto,
  CreatedMemberDto,
  MemberDetailDto,
  MemberDto,
  MemberPageBalanceDto,
  RegisterPurchaseDto,
  SetPasswordDto,
  TemporaryPasswordDto,
  UpdateMemberDto,
} from './dto/users.dto';
import { UsersService } from './users.service';
import {
  PageBalanceLotDto,
  toPageBalanceDto,
  toPageBalanceLotDto,
} from '../statements/dto/page-balance.dto';

/**
 * Gestión de las cuentas de una organización. Solo para quien tenga
 * `USERS_MANAGE`: hoy, los administradores.
 *
 * `SessionGuard` y no `AuthGuard`: estas rutas no aceptan credencial de servicio,
 * porque crear, cambiar o eliminar cuentas debe quedar atribuido a alguien concreto.
 */
@ApiTags('users')
@Controller('users')
@UseGuards(SessionGuard, PermissionsGuard)
@RequirePermissions(PERMISSION.USERS_MANAGE)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Cuentas de la organización, con cuántos documentos conserva cada una' })
  @ApiResponse({ status: 200, type: [MemberDto] })
  async list(@CurrentUser() actor: AuthenticatedUser): Promise<MemberDto[]> {
    return this.users.list(actor.organizationId, quienGestiona(actor));
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Detalle de una cuenta: su membresía y cuánto ha consumido' })
  @ApiResponse({ status: 200, type: MemberDetailDto })
  async detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ): Promise<MemberDetailDto> {
    return this.users.detail(actor.organizationId, quienGestiona(actor), userId);
  }

  /** Saldo en lotes e historial de compras de una cuenta (ADR-0019). */
  @Get(':userId/page-balance')
  @ApiOperation({ summary: 'Saldo de páginas de una cuenta y el historial de sus lotes' })
  @ApiResponse({ status: 200, type: MemberPageBalanceDto })
  async pageBalance(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ): Promise<MemberPageBalanceDto> {
    const { balance, history } = await this.users.pageBalance(actor.organizationId, userId);
    return { balance: toPageBalanceDto(balance, true), history: history.map(toPageBalanceLotDto) };
  }

  /**
   * Registra una compra de Recargas o Profesional que ya se cobró por Yape: el
   * saldo se activa en el acto, con precio y vigencia del catálogo de hoy.
   */
  @Post(':userId/page-lots')
  @ApiOperation({ summary: 'Registra una compra de páginas ya cobrada' })
  @ApiResponse({ status: 201, type: PageBalanceLotDto })
  async registerPurchase(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: RegisterPurchaseDto,
    @Req() request: RequestWithContext,
  ): Promise<PageBalanceLotDto> {
    const lote = await this.users.registerPurchase(
      actor.organizationId,
      quienGestiona(actor),
      userId,
      {
        productCode: body.productCode,
        ...(body.pages !== undefined ? { pages: body.pages } : {}),
        ...(body.paymentReference !== undefined ? { paymentReference: body.paymentReference } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
      },
      request.requestId,
    );
    return toPageBalanceLotDto(lote);
  }

  @Post()
  @ApiOperation({ summary: 'Crea una cuenta; sin contraseña indicada, devuelve una temporal' })
  @ApiResponse({ status: 201, type: CreatedMemberDto })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: CreateMemberDto,
    @Req() request: RequestWithContext,
  ): Promise<CreatedMemberDto> {
    return this.users.create(
      actor.organizationId,
      quienGestiona(actor),
      {
        email: body.email,
        displayName: body.displayName,
        role: body.role,
        ...(body.planCode !== undefined ? { planCode: body.planCode } : {}),
        ...(body.planExpiresOn !== undefined ? { planExpiresOn: body.planExpiresOn } : {}),
        ...(body.password !== undefined ? { password: body.password } : {}),
      },
      request.requestId,
    );
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Cambia nombre, correo, rol, membresía o acceso de una cuenta' })
  @ApiResponse({ status: 200, type: MemberDto })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: UpdateMemberDto,
    @Req() request: RequestWithContext,
  ): Promise<MemberDto> {
    return this.users.update(
      actor.organizationId,
      quienGestiona(actor),
      userId,
      {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.planCode !== undefined ? { planCode: body.planCode } : {}),
        ...(body.planExpiresOn !== undefined ? { planExpiresOn: body.planExpiresOn } : {}),
        ...(body.monthlyPageQuotaOverride !== undefined
          ? { monthlyPageQuotaOverride: body.monthlyPageQuotaOverride }
          : {}),
        ...(body.membershipStatus !== undefined ? { membershipStatus: body.membershipStatus } : {}),
      },
      request.requestId,
    );
  }

  @Post(':userId/password-reset')
  @ApiOperation({ summary: 'Fija o genera la contraseña de una cuenta y cierra sus sesiones' })
  @ApiResponse({ status: 201, type: TemporaryPasswordDto })
  async resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: SetPasswordDto,
    @Req() request: RequestWithContext,
  ): Promise<TemporaryPasswordDto> {
    const temporaryPassword = await this.users.setPassword(
      actor.organizationId,
      quienGestiona(actor),
      userId,
      body.password,
      request.requestId,
    );
    return { temporaryPassword };
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina una cuenta y sus documentos. Nunca a un administrador' })
  async remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Req() request: RequestWithContext,
  ): Promise<void> {
    await this.users.remove(actor.organizationId, quienGestiona(actor), userId, request.requestId);
  }
}

/** La cuenta y el rango con que se decide qué puede hacer sobre las demás. */
function quienGestiona(actor: AuthenticatedUser): MemberActor {
  return { userId: actor.userId, rank: actor.roleRank };
}
