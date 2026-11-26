import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { FEATURE, PLAN_CODE_PATTERN } from '../access-catalog';

const FEATURE_CODES = Object.values(FEATURE);

/** Recorta antes de validar: un nombre de solo espacios no debe pasar por válido. */
function recortar({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class PlanDto {
  @ApiProperty({ example: 'ATLAS' }) code!: string;
  @ApiProperty({ example: 'Atlas' }) name!: string;
  @ApiProperty() description!: string;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Tope técnico de seguridad por PDF; nulo es sin tope',
  })
  maxPagesPerDocument!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Páginas acumuladas al mes que decide el cobro; nulo es sin tope fijo, se cotiza',
  })
  monthlyPageQuota!: number | null;

  @ApiProperty({ description: 'La prueba se consume una sola vez y no se renueva cada mes' })
  trialOneTime!: boolean;

  @ApiProperty({ type: [String], example: ['HISTORY', 'FINANCIAL_CENTER', 'FINANCIAL_CALENDAR'] })
  features!: string[];

  @ApiProperty({ description: 'Plan de las cuentas nuevas si no se indica otro' })
  isDefault!: boolean;

  @ApiProperty({
    nullable: true,
    type: Number,
    example: 1990,
    description: 'Precio publicado en céntimos; nulo si no se vende por catálogo',
  })
  priceCents!: number | null;

  @ApiProperty({ example: 'PEN' })
  currency!: string;
}

/** Precio en céntimos: hasta S/ 999,999.99, nunca negativo ni con decimales. */
const PRECIO_MAXIMO_CENTIMOS = 99_999_999;

export class RoleDto {
  @ApiProperty({ example: 'MEMBER' }) code!: string;
  @ApiProperty({ example: 'Usuario' }) name!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ description: 'Jerarquía: solo se gestionan cuentas de rango inferior' })
  rank!: number;
  @ApiProperty({ nullable: true, type: String, description: 'Plan que se propone con este rol' })
  defaultPlanCode!: string | null;
  @ApiProperty({ description: 'Si su membresía lleva fecha de vencimiento' })
  planExpiryRequired!: boolean;
  @ApiProperty({ type: [String], example: ['STATEMENTS_CONVERT'] }) permissions!: string[];
}

/** Lo que ve un superadministrador: igual que `PlanDto`, más si se ofrece y en qué orden. */
export class PlanAdminDto extends PlanDto {
  @ApiProperty({ description: 'Un plan retirado no se ofrece en altas ni cambios' })
  isActive!: boolean;

  @ApiProperty({ description: 'Orden en que se ofrece, de menor a mayor' })
  sortOrder!: number;
}

export class CreatePlanDto {
  @ApiProperty({
    example: 'PRO',
    description: 'Código del catálogo; no se puede cambiar después de creado.',
  })
  @Transform(recortar)
  @IsString()
  @Matches(PLAN_CODE_PATTERN)
  code!: string;

  @ApiProperty({ example: 'Pro' })
  @Transform(recortar)
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'Conversión e historial, 10 documentos y hasta 100 páginas por PDF.' })
  @Transform(recortar)
  @IsString()
  @MaxLength(255)
  description!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    default: 1000,
    description: 'Tope técnico de seguridad por PDF. Sin indicarlo, 1000 (igual que los demás).',
  })
  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @IsInt()
  @Min(1)
  maxPagesPerDocument?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Páginas acumuladas al mes que decide el cobro; nulo o sin indicarlo, se cotiza.',
  })
  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @IsInt()
  @Min(1)
  monthlyPageQuota?: number | null;

  @ApiPropertyOptional({ default: false, description: 'La prueba no se renueva cada mes' })
  @IsOptional()
  @IsBoolean()
  trialOneTime?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    example: 1990,
    description: 'Precio publicado en céntimos. Nulo o sin indicarlo: no se vende por catálogo.',
  })
  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @IsInt()
  @Min(0)
  @Max(PRECIO_MAXIMO_CENTIMOS)
  priceCents?: number | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['HISTORY'],
    description: 'Vistas que habilita, del catálogo de funciones. Sin indicarlo, ninguna.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(FEATURE_CODES, { each: true })
  features?: string[];
}

/** Igual que al crear, pero todo opcional: solo se cambia lo que se envía. */
export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @IsInt()
  @Min(1)
  maxPagesPerDocument?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @IsInt()
  @Min(1)
  monthlyPageQuota?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  trialOneTime?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Un plan retirado no se ofrece en altas ni cambios' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Precio en céntimos' })
  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @IsInt()
  @Min(0)
  @Max(PRECIO_MAXIMO_CENTIMOS)
  priceCents?: number | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['HISTORY', 'FINANCIAL_CENTER'],
    description: 'Reemplaza la lista completa de vistas que habilita. Sin indicarlo, no cambia.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(FEATURE_CODES, { each: true })
  features?: string[];
}

export class SupportContactDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Teléfono de soporte; nulo si no está configurado',
  })
  phone!: string | null;
}
