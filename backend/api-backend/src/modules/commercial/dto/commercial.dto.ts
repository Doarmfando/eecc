import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { MAX_PAGES_PER_PURCHASE, PRICING, PRODUCT_CODE_PATTERN } from '../commercial-pricing';

const PRICINGS = Object.values(PRICING);

/** Precio en céntimos: hasta S/ 999,999.99, nunca negativo ni con decimales. */
const PRECIO_MAXIMO_CENTIMOS = 99_999_999;

/** Vigencia del saldo: hasta dos años; más que eso deja de ser una compra con vencimiento. */
const VIGENCIA_MAXIMA_DIAS = 730;

function recortar({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Un parámetro de consulta llega como texto; se convierte solo si es un número. */
function aEntero({ value }: TransformFnParams): unknown {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

export class CommercialProductDto {
  @ApiProperty({ example: 'RECARGA' }) code!: string;
  @ApiProperty({ example: 'ATLAS Recargas' }) name!: string;
  @ApiProperty() description!: string;

  @ApiProperty({
    enum: PRICINGS,
    description: 'PER_PAGE: se cobra por página. PACKAGE: paquete cerrado de páginas.',
  })
  pricing!: string;

  @ApiProperty({ nullable: true, type: Number, description: 'Páginas del paquete (PACKAGE)' })
  pageQuantity!: number | null;

  @ApiProperty({ nullable: true, type: Number, description: 'Mínimo por compra (PER_PAGE)' })
  minimumPages!: number | null;

  @ApiProperty({
    example: 15,
    description: 'Céntimos: precio del paquete (PACKAGE) o de una página (PER_PAGE)',
  })
  priceCents!: number;

  @ApiProperty({ example: 'PEN' }) currency!: string;

  @ApiProperty({ example: 90, description: 'Días que dura el saldo desde que se registra' })
  validityDays!: number;
}

export class CommercialProductAdminDto extends CommercialProductDto {
  @ApiProperty({ description: 'Un producto retirado no se ofrece ni se cotiza' })
  isActive!: boolean;

  @ApiProperty({ description: 'Orden en que se ofrece, de menor a mayor' })
  sortOrder!: number;
}

export class CreateCommercialProductDto {
  @ApiProperty({ example: 'PROFESIONAL_10000', description: 'No se puede cambiar después.' })
  @Transform(recortar)
  @IsString()
  @Matches(PRODUCT_CODE_PATTERN)
  code!: string;

  @ApiProperty({ example: 'ATLAS Profesional 10000' })
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: '10,000 páginas para procesar en volumen. Vencen a los 90 días.' })
  @Transform(recortar)
  @IsString()
  @MaxLength(255)
  description!: string;

  @ApiProperty({ enum: PRICINGS, description: 'No se puede cambiar después.' })
  @IsIn(PRICINGS)
  pricing!: string;

  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Obligatorio en PACKAGE' })
  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGES_PER_PURCHASE)
  pageQuantity?: number | null;

  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Obligatorio en PER_PAGE' })
  @IsOptional()
  @ValidateIf((_objeto, valor) => valor !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGES_PER_PURCHASE)
  minimumPages?: number | null;

  @ApiProperty({ example: 2990, description: 'Precio en céntimos' })
  @IsInt()
  @Min(0)
  @Max(PRECIO_MAXIMO_CENTIMOS)
  priceCents!: number;

  @ApiProperty({ example: 90 })
  @IsInt()
  @Min(1)
  @Max(VIGENCIA_MAXIMA_DIAS)
  validityDays!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

/**
 * Todo opcional: solo se cambia lo que se envía. El código y la forma de precio
 * no se cambian: un paquete que pasa a cobrarse por página es otro producto.
 *
 * Cambiar precio o vigencia no toca lo ya vendido: cada compra guarda lo que se
 * pagó y su propio vencimiento al registrarse (ADR-0019).
 */
export class UpdateCommercialProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ type: Number, description: 'Solo en PACKAGE' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGES_PER_PURCHASE)
  pageQuantity?: number;

  @ApiPropertyOptional({ type: Number, description: 'Solo en PER_PAGE' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGES_PER_PURCHASE)
  minimumPages?: number;

  @ApiPropertyOptional({ description: 'Precio en céntimos' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PRECIO_MAXIMO_CENTIMOS)
  priceCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(VIGENCIA_MAXIMA_DIAS)
  validityDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class QuoteQueryDto {
  @ApiPropertyOptional({
    description: 'Páginas a comprar (PER_PAGE). Sin indicarlo, el mínimo. En PACKAGE no aplica.',
  })
  @IsOptional()
  @Transform(aEntero)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGES_PER_PURCHASE)
  pages?: number;
}

export class SuggestionDto {
  @ApiProperty({ example: 'PROFESIONAL_500' }) productCode!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 500 }) pages!: number;
  @ApiProperty({ example: 2990 }) priceCents!: number;
  @ApiProperty({ example: 10, description: 'Ahorro frente a lo cotizado; cero si cuesta igual' })
  savingsCents!: number;
}

export class QuoteDto {
  @ApiProperty({ example: 'RECARGA' }) productCode!: string;
  @ApiProperty({ example: 200 }) pages!: number;
  @ApiProperty({ example: 3000, description: 'Total en céntimos' }) priceCents!: number;
  @ApiProperty({ example: 'PEN' }) currency!: string;
  @ApiProperty({ example: 90 }) validityDays!: number;

  @ApiProperty({
    nullable: true,
    type: SuggestionDto,
    description: 'Paquete que da al menos esas páginas por no más dinero',
  })
  suggestion!: SuggestionDto | null;
}
