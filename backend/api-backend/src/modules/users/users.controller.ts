import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser, type RequestWithContext } from '../../common/http/request-context';
import { Roles } from '../../common/security/roles.decorator';
import { RolesGuard } from '../../common/security/roles.guard';
import { SessionGuard } from '../../common/security/session.guard';
import type { AuthenticatedUser } from '../auth/auth.service';
import {
  CreateMemberDto,
  CreatedMemberDto,
  MemberDto,
  TemporaryPasswordDto,
  UpdateMemberDto,
} from './dto/users.dto';
import { UsersService } from './users.service';

/**
 * Gestión de las personas de una organización.
 *
 * `SessionGuard` y no `AuthGuard`: estas rutas no aceptan credencial de servicio,
 * porque crear o desactivar cuentas debe quedar atribuido a alguien concreto.
 */
@ApiTags('users')
@Controller('users')
@UseGuards(SessionGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @ApiOperation({ summary: 'Personas de la organización' })
  @ApiResponse({ status: 200, type: [MemberDto] })
  async list(@CurrentUser() actor: AuthenticatedUser): Promise<MemberDto[]> {
    return this.users.list(actor.organizationId);
  }

  @Post()
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @ApiOperation({ summary: 'Da de alta a una persona y devuelve su contraseña inicial' })
  @ApiResponse({ status: 201, type: CreatedMemberDto })
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: CreateMemberDto,
    @Req() request: RequestWithContext,
  ): Promise<CreatedMemberDto> {
    return this.users.create(
      actor.organizationId,
      actor.userId,
      { email: body.email, displayName: body.displayName, role: body.role },
      request.requestId,
    );
  }

  @Patch(':userId')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @ApiOperation({ summary: 'Cambia el rol o revoca el acceso de una persona' })
  @ApiResponse({ status: 200, type: MemberDto })
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: UpdateMemberDto,
    @Req() request: RequestWithContext,
  ): Promise<MemberDto> {
    return this.users.updateMembership(
      actor.organizationId,
      actor.userId,
      userId,
      {
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.membershipStatus !== undefined ? { membershipStatus: body.membershipStatus } : {}),
      },
      request.requestId,
    );
  }

  @Post(':userId/password-reset')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  @ApiOperation({ summary: 'Restablece la contraseña y cierra las sesiones de esa persona' })
  @ApiResponse({ status: 201, type: TemporaryPasswordDto })
  async resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Req() request: RequestWithContext,
  ): Promise<TemporaryPasswordDto> {
    const temporaryPassword = await this.users.resetPassword(
      actor.organizationId,
      actor.userId,
      userId,
      request.requestId,
    );
    return { temporaryPassword };
  }
}
