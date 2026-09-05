import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateStatementDto {
  @ApiPropertyOptional({ description: 'Año a usar cuando el documento omite el del periodo' })
  @IsOptional()
  @Transform(({ value }): unknown =>
    typeof value === 'string' && value !== '' ? Number(value) : value,
  )
  @IsInt()
  @Min(1900)
  @Max(2999)
  defaultYear?: number;

  @ApiPropertyOptional({ description: 'Estrategia de extracción a forzar' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{3,64}$/)
  extractorId?: string;
}

export class StatementCheckDto {
  @ApiProperty() code!: string;
  @ApiProperty() status!: string;
}

export class StatementArtifactDto {
  @ApiProperty() id!: string;
  @ApiProperty() kind!: string;
  @ApiProperty() byteSize!: number;
  /** Nombre generado por el sistema; nunca el del documento original. */
  @ApiProperty() name!: string;
}

export class JobResponseDto {
  @ApiProperty() jobId!: string;
  @ApiProperty() statementId!: string;
  @ApiProperty({ enum: ['PENDING', 'PROCESSING', 'SUCCEEDED', 'NEEDS_REVIEW', 'FAILED'] })
  status!: string;
  @ApiProperty() attemptNumber!: number;
  @ApiProperty() extractorId!: string;
  @ApiProperty() extractorVersion!: string;
  @ApiProperty() rowCount!: number;
  @ApiProperty() movementCount!: number;
  @ApiProperty() pageCount!: number;
  @ApiProperty({ type: [String] }) warningCodes!: string[];
  @ApiProperty({ type: [StatementCheckDto] }) checks!: StatementCheckDto[];
  @ApiProperty({ type: [StatementArtifactDto] }) artifacts!: StatementArtifactDto[];
  @ApiProperty() reused!: boolean;
}
