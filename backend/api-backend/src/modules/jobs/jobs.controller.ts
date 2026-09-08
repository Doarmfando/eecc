import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { API_KEY_HEADER } from '../../common/security/api-key.guard';
import { AuthGuard } from '../../common/security/auth.guard';
import { CurrentOrganization, type OrganizationContext } from '../../common/http/request-context';
import { JobResponseDto } from '../statements/dto/create-statement.dto';
import { ArtifactDownloadService } from '../statements/artifact-download.service';
import { JobListDto, JobListQueryDto } from './dto/job-list.dto';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiHeader({
  name: API_KEY_HEADER,
  required: false,
  description: 'Credencial de servicio; alternativa a la cookie de sesión',
})
@Controller('jobs')
@UseGuards(AuthGuard)
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly downloads: ArtifactDownloadService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Historial de trabajos de la organización' })
  @ApiResponse({ status: 200, type: JobListDto })
  async list(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: JobListQueryDto,
  ): Promise<JobListDto> {
    return this.jobs.list(organization.organizationId, {
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });
  }

  @Get(':jobId')
  @ApiOperation({ summary: 'Consulta el estado de un trabajo de la organización' })
  @ApiResponse({ status: 200, type: JobResponseDto })
  async findOne(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('jobId', new ParseUUIDPipe({ version: '4' })) jobId: string,
  ): Promise<JobResponseDto> {
    return this.jobs.findOne(organization.organizationId, jobId);
  }

  @Get(':jobId/artifacts/:artifactId/content')
  @ApiOperation({ summary: 'Descarga un artefacto del trabajo autorizado' })
  @ApiResponse({ status: 200, description: 'Contenido binario del artefacto' })
  @Header('Cache-Control', 'private, no-store')
  async download(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('jobId', new ParseUUIDPipe({ version: '4' })) jobId: string,
    @Param('artifactId', new ParseUUIDPipe({ version: '4' })) artifactId: string,
    @Res() response: Response,
  ): Promise<void> {
    const artifact = await this.downloads.download(organization.organizationId, jobId, artifactId);
    response
      .status(200)
      .type(artifact.contentType)
      .setHeader('Content-Disposition', `attachment; filename="${artifact.fileName}"`);
    response.send(artifact.content);
  }
}
