import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export const JOB_LIST_DEFAULT_LIMIT = 20;
export const JOB_LIST_MAX_LIMIT = 100;

export class JobListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: JOB_LIST_MAX_LIMIT, default: JOB_LIST_DEFAULT_LIMIT })
  @IsOptional()
  @Transform(({ value }): unknown =>
    typeof value === 'string' && value !== '' ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(JOB_LIST_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: 'Cursor devuelto por la página anterior' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,200}$/)
  cursor?: string;
}

export class JobListItemDto {
  @ApiProperty() jobId!: string;
  @ApiProperty() statementId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ description: 'Instante en UTC' }) createdAt!: string;
  @ApiProperty() extractorId!: string;
  @ApiProperty() movementCount!: number;
  @ApiProperty() warningCount!: number;
  @ApiProperty() artifactCount!: number;

  /** Si lo subió quien consulta. El cupo de retención es por persona. */
  @ApiProperty() uploadedByMe!: boolean;
}

export class JobListDto {
  @ApiProperty({ type: [JobListItemDto] }) items!: JobListItemDto[];

  @ApiProperty({ nullable: true, description: 'Cursor de la siguiente página' })
  nextCursor!: string | null;
}
