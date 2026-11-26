import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/http/request-context';
import { PermissionsGuard, RequirePermissions } from '../../common/security/permissions.guard';
import { SessionGuard } from '../../common/security/session.guard';
import { PERMISSION } from '../access/access-catalog';
import type { AuthenticatedUser } from '../auth/auth.service';
import { PersonalPaymentDto, PersonalPaymentInputDto, PersonalStateDto } from './personal.dto';
import { PersonalService } from './personal.service';

@ApiTags('personal')
@Controller('personal')
@UseGuards(SessionGuard, PermissionsGuard)
export class PersonalController {
  constructor(private readonly personal: PersonalService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiResponse({ status: 200, type: PersonalStateDto })
  state(@CurrentUser() actor: AuthenticatedUser): Promise<PersonalStateDto> {
    return this.personal.state(actor.organizationId, actor.userId);
  }

  @Post('cancel-renewal')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancela la próxima renovación y conserva los periodos pagados' })
  cancel(@CurrentUser() actor: AuthenticatedUser): Promise<void> {
    return this.personal.cancelRenewal(actor.organizationId, actor.userId);
  }

  @Get('users/:userId')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSION.USERS_MANAGE)
  @ApiResponse({ status: 200, type: PersonalStateDto })
  memberState(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ): Promise<PersonalStateDto> {
    return this.personal.state(actor.organizationId, userId, {
      userId: actor.userId,
      rank: actor.roleRank,
    });
  }

  @Post('users/:userId/payments')
  @RequirePermissions(PERMISSION.USERS_MANAGE)
  @ApiOperation({ summary: 'Asienta un cobro confirmado y programa un periodo de Personal' })
  @ApiResponse({ status: 201, type: PersonalPaymentDto })
  register(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: PersonalPaymentInputDto,
  ): Promise<PersonalPaymentDto> {
    return this.personal.register(
      actor.organizationId,
      userId,
      { userId: actor.userId, rank: actor.roleRank },
      body,
    );
  }
}
