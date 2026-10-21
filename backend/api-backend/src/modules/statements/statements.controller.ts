import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { API_KEY_HEADER } from '../../common/security/api-key.guard';
import { AuthGuard } from '../../common/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/security/permissions.guard';
import { PERMISSION } from '../access/access-catalog';
import { CurrentOrganization, type OrganizationContext } from '../../common/http/request-context';
import {
  CreateStatementDto,
  DeletedStatementsDto,
  JobResponseDto,
} from './dto/create-statement.dto';
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
  constructor(private readonly statements: StatementsService) {}

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

    return this.statements.process({
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
      // La membresía fija el cupo y las páginas. Una credencial de servicio no
      // tiene: conserva el cupo de `RETAINED_STATEMENTS_PER_USER` y no tiene límite
      // de páginas.
      ...(organization.plan
        ? {
            retainedStatements: organization.plan.maxRetainedStatements,
            maxPagesPerDocument: organization.plan.maxPagesPerDocument,
            membershipExpired: organization.plan.expired,
          }
        : {}),
      ...(requestId !== undefined ? { requestId } : {}),
    });
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
