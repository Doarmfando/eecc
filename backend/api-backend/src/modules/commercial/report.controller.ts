import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/http/request-context';
import { PermissionsGuard, RequirePermissions } from '../../common/security/permissions.guard';
import { SessionGuard } from '../../common/security/session.guard';
import { PERMISSION } from '../access/access-catalog';
import type { AuthenticatedUser } from '../auth/auth.service';
import { CommercialReportQuery, type CommercialReport } from './report.dto';
import { CommercialReportService } from './report.service';

@ApiTags('commercial')
@Controller('commercial-report')
@UseGuards(SessionGuard, PermissionsGuard)
@RequirePermissions(PERMISSION.USERS_MANAGE)
export class CommercialReportController {
  constructor(private readonly report: CommercialReportService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Indicadores comerciales y operativos de la organización de la sesión' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: CommercialReportQuery,
  ): Promise<CommercialReport> {
    return this.report.get(actor.organizationId, query);
  }
}
