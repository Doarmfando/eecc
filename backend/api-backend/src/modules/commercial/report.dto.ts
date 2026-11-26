import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

const REPORT_STATUSES = ['SUCCEEDED', 'NEEDS_REVIEW', 'FAILED', 'REJECTED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export class CommercialReportQuery {
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  organizationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]{1,31}$/)
  product?: string;

  @ApiPropertyOptional({ enum: REPORT_STATUSES })
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status?: ReportStatus;
}

export interface CommercialReport {
  window: { from: string; to: string; asOf: string; zone: string };
  accounts: {
    registered: number;
    free: number;
    personalActive: number;
    expired: number;
    cancelled: number;
    freeCohort: number;
    converted: number;
  };
  sales: {
    product: string;
    kind: string;
    currency: string;
    payments: number;
    pagesSold: number;
    revenueCents: number;
    activeMonthlyCents: number;
  }[];
  credits: {
    product: string;
    granted: number;
    available: number;
    held: number;
    expired: number;
    consumed: number;
    estimatedCostCents: number | null;
  }[];
  operations: { status: ReportStatus; count: number; pages: number }[];
  users: { userId: string | null; pages: number; estimatedCostCents: number | null }[];
  estimatedCostPerPagePen: string | null;
}
