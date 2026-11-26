import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateStatementDto {
  @ApiPropertyOptional({ description: 'Nombre visible del PDF, enviado como texto UTF-8' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  sourceFileName?: string;

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

  /**
   * Contraseña de apertura del PDF, cuando el banco lo envía protegido.
   *
   * Solo viaja al worker para abrir el documento: no se guarda, no se registra y
   * no forma parte de la clave de idempotencia.
   */
  @ApiPropertyOptional({
    description: 'Contraseña de apertura del PDF protegido; no se almacena',
    format: 'password',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  pdfPassword?: string;

  /**
   * Documento propio que la persona eligió borrar si este supera el cupo.
   *
   * Solo se respeta si es suyo y de su organización; si no, se borra el más
   * antiguo, como siempre (ADR-0014).
   */
  @ApiPropertyOptional({ description: 'Documento a reemplazar al superar el cupo' })
  @IsOptional()
  @IsUUID()
  replaceStatementId?: string;
}

export class DeletedStatementsDto {
  @ApiProperty({ description: 'Documentos borrados; cero si ya no estaban' })
  deletedCount!: number;
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

export class ReplacedStatementDto {
  @ApiProperty() statementId!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Nombre del PDF visible solo a su dueño',
  })
  sourceFileName!: string | null;
}

/** Dónde mirar un aviso: solo el código y la página, nunca contenido. */
export class WarningPageDto {
  @ApiProperty() code!: string;
  @ApiProperty({ minimum: 1 }) page!: number;
}

export class JobResponseDto {
  @ApiPropertyOptional({ nullable: true, description: 'Nombre del PDF visible solo a su dueño' })
  sourceFileName?: string | null;
  @ApiProperty() jobId!: string;
  @ApiProperty() statementId!: string;
  @ApiProperty({ description: 'Cuándo se subió y convirtió el documento (ISO 8601)' })
  createdAt!: string;
  @ApiProperty({ enum: ['PENDING', 'PROCESSING', 'SUCCEEDED', 'NEEDS_REVIEW', 'FAILED'] })
  status!: string;
  @ApiProperty() attemptNumber!: number;
  @ApiProperty() extractorId!: string;
  @ApiProperty() extractorVersion!: string;
  @ApiProperty() rowCount!: number;
  @ApiProperty() movementCount!: number;
  @ApiProperty() pageCount!: number;
  @ApiProperty({ type: [String] }) warningCodes!: string[];
  /** Los avisos que el worker pudo ubicar, como la página con huecos de un PDF. */
  @ApiProperty({ type: [WarningPageDto] }) warningPages!: WarningPageDto[];
  @ApiProperty({ type: [StatementCheckDto] }) checks!: StatementCheckDto[];
  @ApiProperty({ type: [StatementArtifactDto] }) artifacts!: StatementArtifactDto[];
  @ApiProperty() reused!: boolean;

  /**
   * Documentos borrados para respetar el cupo de la membresía al guardar este. La
   * interfaz lo avisa: la persona eligió cuál, pero debe saber que ya no está.
   */
  @ApiProperty({ type: [ReplacedStatementDto] })
  replacedStatements!: ReplacedStatementDto[];
}
