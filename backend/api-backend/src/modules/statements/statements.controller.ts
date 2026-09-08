import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { API_KEY_HEADER } from '../../common/security/api-key.guard';
import { AuthGuard } from '../../common/security/auth.guard';
import { CurrentOrganization, type OrganizationContext } from '../../common/http/request-context';
import { CreateStatementDto, JobResponseDto } from './dto/create-statement.dto';
import { STATEMENT_PROCESSOR, type StatementProcessor } from './statements.port';

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
@UseGuards(AuthGuard)
export class StatementsController {
  constructor(@Inject(STATEMENT_PROCESSOR) private readonly statements: StatementProcessor) {}

  @Post()
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
      fileName: document.originalname,
      mimeType: document.mimetype,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      ...(body.defaultYear !== undefined ? { defaultYear: body.defaultYear } : {}),
      ...(body.extractorId !== undefined ? { extractorId: body.extractorId } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
    });
  }
}
