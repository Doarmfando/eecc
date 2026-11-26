import { ApiProperty } from '@nestjs/swagger';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export const PAYMENT_REFERENCE = /^[A-Z0-9][A-Z0-9._-]{0,99}$/;

export class PersonalPaymentInputDto {
  @ApiProperty({ description: 'Número de operación del pago confirmado', example: 'YAPE-1234' })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(PAYMENT_REFERENCE)
  reference!: string;

  @ApiProperty({ description: 'Importe confirmado, en céntimos de la moneda indicada' })
  @IsInt()
  @Min(1)
  @Max(9_999_999_999)
  priceCents!: number;

  @ApiProperty({ example: 'PEN' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}

export class PersonalPaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty() priceCents!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() pages!: number;
  @ApiProperty({ format: 'date' }) startsOn!: string;
  @ApiProperty({ format: 'date', description: 'Último día pagado, inclusive' })
  paidThrough!: string;
  @ApiProperty({ format: 'date-time' }) recordedAt!: string;
}

export class PersonalStateDto {
  @ApiProperty() canRegister!: boolean;
  @ApiProperty() currentPlan!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date' }) expiresOn!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) renewalCancelledAt!:
    string | null;
  @ApiProperty({ type: Number, nullable: true }) priceCents!: number | null;
  @ApiProperty({ type: String, nullable: true }) currency!: string | null;
  @ApiProperty({ type: [PersonalPaymentDto] }) payments!: PersonalPaymentDto[];
}
