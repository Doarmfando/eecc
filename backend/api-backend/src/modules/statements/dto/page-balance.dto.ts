import { ApiProperty } from '@nestjs/swagger';
import { PageLotSource } from '@prisma/client';

import type { PageBalance, PageBalanceLot } from '../statement-usage.service';

export class PageBalanceLotDto {
  @ApiProperty({ nullable: true, type: String, description: 'Nulo: se crea al primer uso' })
  id!: string | null;

  @ApiProperty({ enum: PageLotSource }) source!: PageLotSource;
  @ApiProperty({ nullable: true, type: String }) planCode!: string | null;
  @ApiProperty({ nullable: true, type: String }) productCode!: string | null;
  @ApiProperty({ nullable: true, type: String }) productName!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty({ description: 'Consumido, incluido lo de antes de los lotes' }) consumed!: number;
  @ApiProperty({ description: 'Apartado por subidas en curso' }) held!: number;
  @ApiProperty() available!: number;
  @ApiProperty({ description: 'Instante en UTC' }) startsAt!: string;

  @ApiProperty({ nullable: true, type: String, description: 'Instante en UTC; nulo: no vence' })
  expiresAt!: string | null;

  @ApiProperty({ nullable: true, type: Number, description: 'Lo que se cobró, en céntimos' })
  pricePaidCents!: number | null;

  @ApiProperty({ nullable: true, type: String }) currency!: string | null;
  @ApiProperty({ nullable: true, type: String }) paymentReference!: string | null;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ nullable: true, type: String }) registeredByName!: string | null;
  @ApiProperty({ nullable: true, type: String }) createdAt!: string | null;
}

class PeriodDto {
  @ApiProperty({ description: 'Instante en UTC' }) startsAt!: string;
  @ApiProperty({ description: 'Instante en UTC, exclusivo' }) endsAt!: string;
}

/**
 * Saldo de páginas de una persona (ADR-0019). Conserva `pagesUsed` y
 * `monthlyPageQuota` con el sentido de antes —consumido y tope del periodo en
 * curso— para que el aviso de la subida siga leyéndolos igual.
 */
export class PageBalanceDto {
  @ApiProperty({ description: 'Consumido del periodo en curso o de la prueba' })
  pagesUsed!: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Páginas por periodo de la membresía; nulo si no da páginas o no tiene tope',
  })
  monthlyPageQuota!: number | null;

  @ApiProperty({ description: 'Sin tope de cobro (plan interno de administración)' })
  unlimited!: boolean;

  @ApiProperty({ description: 'Membresía vencida: solo cuentan las compras' })
  membershipExpired!: boolean;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Suma de lo disponible en los lotes vigentes; nulo si no hay tope',
  })
  pagesAvailable!: number | null;

  @ApiProperty({ nullable: true, type: PeriodDto }) period!: PeriodDto | null;

  @ApiProperty({ type: [PageBalanceLotDto], description: 'Lotes vigentes, en orden de uso' })
  lots!: PageBalanceLotDto[];
}

export function toPageBalanceLotDto(lote: PageBalanceLot): PageBalanceLotDto {
  return {
    ...lote,
    startsAt: lote.startsAt.toISOString(),
    expiresAt: lote.expiresAt?.toISOString() ?? null,
    createdAt: lote.createdAt?.toISOString() ?? null,
  };
}

export function toPageBalanceDto(saldo: PageBalance): PageBalanceDto {
  return {
    pagesUsed: saldo.periodUsed,
    monthlyPageQuota: saldo.unlimited ? null : saldo.periodQuota,
    unlimited: saldo.unlimited,
    membershipExpired: saldo.membershipExpired,
    pagesAvailable: saldo.pagesAvailable,
    period: saldo.period
      ? { startsAt: saldo.period.startsAt.toISOString(), endsAt: saldo.period.endsAt.toISOString() }
      : null,
    lots: saldo.lots.map(toPageBalanceLotDto),
  };
}
