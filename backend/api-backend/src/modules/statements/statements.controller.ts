import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { API_KEY_HEADER } from '../../common/security/api-key.guard';
import { AuthGuard } from '../../common/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/security/permissions.guard';
import { hasPlanFeature, requirePlanFeature } from '../../common/security/require-plan-feature';
import { FEATURE, PERMISSION } from '../access/access-catalog';
import { CurrentOrganization, type OrganizationContext } from '../../common/http/request-context';
import {
  CreateStatementDto,
  DeletedStatementsDto,
  JobResponseDto,
} from './dto/create-statement.dto';
import { PageBalanceDto, toPageBalanceDto } from './dto/page-balance.dto';
import { PageHistoryDto, PageHistoryKind } from './dto/page-history.dto';
import { StatementUsageService } from './statement-usage.service';
import { StatementsService } from './statements.service';

interface UploadedPdf {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@ApiTags('statements')
@ApiHeader({
  name: API_KEY_HEADER,
  required: false,
  description: 'Credencial de servicio; alternativa a la cookie de sesión',
})
@Controller('statements')
@UseGuards(AuthGuard, PermissionsGuard)
export class StatementsController {
  constructor(
    private readonly statements: StatementsService,
    private readonly usage: StatementUsageService,
  ) {}

  /**
   * Saldo de páginas de quien consulta, en lotes (ADR-0019): lo que le queda de
   * su periodo o su prueba y de cada compra, en el orden en que se gastan. La
   * interfaz lo usa para avisar si un PDF no le alcanza antes de subirlo.
   */
  @Get('usage')
  @RequirePermissions(PERMISSION.STATEMENTS_CONVERT)
  @ApiOperation({ summary: 'Saldo de páginas: periodo, prueba y compras vigentes' })
  @ApiResponse({ status: HttpStatus.OK, type: PageBalanceDto })
  async usageThisPeriod(
    @CurrentOrganization() organization: OrganizationContext,
  ): Promise<PageBalanceDto> {
    if (!organization.userId || !organization.plan) {
      // Una credencial de servicio no tiene membresía ni saldo: sin tope.
      return {
        pagesUsed: 0,
        monthlyPageQuota: null,
        unlimited: true,
        membershipExpired: false,
        pagesAvailable: null,
        period: null,
        lots: [],
      };
    }
    return toPageBalanceDto(
      await this.usage.balance(organization.organizationId, organization.userId),
    );
  }

  @Get('usage/history/:kind')
  @RequirePermissions(PERMISSION.STATEMENTS_CONVERT)
  @ApiOperation({ summary: 'Historial comercial propio de compras o consumo de páginas' })
  @ApiParam({ name: 'kind', enum: PageHistoryKind })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiResponse({ status: HttpStatus.OK, type: PageHistoryDto })
  async pageHistory(
    @CurrentOrganization() { organizationId, userId }: OrganizationContext,
    @Param('kind', new ParseEnumPipe(PageHistoryKind)) kind: PageHistoryKind,
    @Query('cursor', new ParseUUIDPipe({ version: '4', optional: true })) cursor?: string,
  ): Promise<PageHistoryDto> {
    if (!userId) {
      throw new ForbiddenException({ code: 'SESSION_REQUIRED' });
    }
    return kind === PageHistoryKind.PURCHASES
      ? this.usage.purchaseHistory(organizationId, userId, cursor)
      : this.usage.consumptionHistory(organizationId, userId, cursor);
  }

  @Post()
  @RequirePermissions(PERMISSION.STATEMENTS_CONVERT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registra un estado de cuenta y ejecuta su procesamiento' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: HttpStatus.CREATED, type: JobResponseDto })
  @UseInterceptors(FileInterceptor('document'))
  async create(
    @CurrentOrganization() organization: OrganizationContext,
    @UploadedFile() document: UploadedPdf | undefined,
    @Body() body: CreateStatementDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<JobResponseDto> {
    if (!document) {
      throw new BadRequestException({ code: 'DOCUMENT_REQUIRED' });
    }
    if (idempotencyKey !== undefined && !/^[\w.:-]{8,128}$/.test(idempotencyKey)) {
      throw new BadRequestException({ code: 'INVALID_IDEMPOTENCY_KEY' });
    }
    if (body.replaceStatementId !== undefined) requirePlanFeature(organization, FEATURE.HISTORY);

    const job = await this.statements.process({
      organizationId: organization.organizationId,
      userId: organization.userId,
      content: document.buffer,
      fileName: body.sourceFileName ?? document.originalname,
      mimeType: document.mimetype,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      ...(body.defaultYear !== undefined ? { defaultYear: body.defaultYear } : {}),
      ...(body.extractorId !== undefined ? { extractorId: body.extractorId } : {}),
      ...(body.pdfPassword ? { pdfPassword: body.pdfPassword } : {}),
      ...(body.replaceStatementId !== undefined
        ? { replaceStatementId: body.replaceStatementId }
        : {}),
      // El cupo de documentos es el mismo para cualquiera (`RETAINED_STATEMENTS_PER_USER`);
      // la membresía solo fija las páginas. Una credencial de servicio no tiene
      // plan y no tiene límite de páginas.
      ...(organization.plan
        ? {
            maxPagesPerDocument: organization.plan.maxPagesPerDocument,
            monthlyPageQuota: organization.plan.monthlyPageQuota,
            membershipExpired: organization.plan.expired,
          }
        : {}),
      ...(requestId !== undefined ? { requestId } : {}),
    });
    if (!hasPlanFeature(organization, FEATURE.HISTORY) && job.replacedStatements.length > 0) {
      return Object.assign(new JobResponseDto(), job, {
        replacedStatements: [],
        replacedStatementCount: job.replacedStatements.length,
      });
    }
    return job;
  }

  /**
   * Quita del historial todos los documentos propios, con sus archivos. No toca
   * los de nadie más, aunque compartan organización.
   */
  @Delete()
  @RequirePermissions(PERMISSION.STATEMENTS_CONVERT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borra todos los documentos propios del historial' })
  @ApiResponse({ status: HttpStatus.OK, type: DeletedStatementsDto })
  async deleteAll(
    @CurrentOrganization() organization: OrganizationContext,
    @Headers('x-request-id') requestId?: string,
  ): Promise<DeletedStatementsDto> {
    requirePlanFeature(organization, FEATURE.HISTORY);
    return this.statements.deleteOwn(
      organization.organizationId,
      organization.userId,
      undefined,
      requestId,
    );
  }

  /** Quita del historial un documento propio. Repetirlo responde `deletedCount: 0`. */
  @Delete(':statementId')
  @RequirePermissions(PERMISSION.STATEMENTS_CONVERT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Borra un documento propio del historial, con sus archivos' })
  @ApiResponse({ status: HttpStatus.OK, type: DeletedStatementsDto })
  async deleteOne(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('statementId', new ParseUUIDPipe({ version: '4' })) statementId: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<DeletedStatementsDto> {
    return this.statements.deleteOwn(
      organization.organizationId,
      organization.userId,
      statementId,
      requestId,
    );
  }
}
