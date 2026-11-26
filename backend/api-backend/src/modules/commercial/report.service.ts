import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { decimalToCents } from '../../common/money/cents';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  addDaysToIsoDate,
  businessToday,
  isValidIsoDate,
  startOfBusinessDay,
} from '../../common/time/business-date';
import type { AppConfig } from '../../config/app-config';
import { MARGEN_DE_RESERVA_MS } from '../statements/statement-usage.service';
import type { CommercialReport, CommercialReportQuery, ReportStatus } from './report.dto';
import {
  accountsQuery,
  creditsQuery,
  operationsQuery,
  salesQuery,
  type Scope,
} from './report.queries';

@Injectable()
export class CommercialReportService {
  private readonly zone: string;
  private readonly holdingMs: number;
  private readonly cost: Prisma.Decimal | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.zone = config.get('BUSINESS_TIMEZONE', { infer: true });
    this.holdingMs = config.get('WORKER_TIMEOUT_MS', { infer: true }) + MARGEN_DE_RESERVA_MS;
    const cost = config.get('COMMERCIAL_ESTIMATED_COST_PEN_PER_PAGE', { infer: true });
    this.cost = cost ? new Prisma.Decimal(cost) : null;
  }

  async get(
    organizationId: string,
    query: CommercialReportQuery,
    now = new Date(),
  ): Promise<CommercialReport> {
    if (query.organizationId && query.organizationId !== organizationId) {
      throw new ForbiddenException({ code: 'REPORT_ORGANIZATION_FORBIDDEN' });
    }
    const today = businessToday(this.zone, now);
    const to = query.to ?? today;
    const from = query.from ?? (isValidIsoDate(to) ? addDaysToIsoDate(to, -29) : to);
    if (
      !isValidIsoDate(from) ||
      !isValidIsoDate(to) ||
      from > to ||
      from < addDaysToIsoDate(to, -365)
    ) {
      throw new BadRequestException({ code: 'INVALID_REPORT_DATES' });
    }

    const scope: Scope = {
      org: organizationId,
      user: query.userId ?? null,
      product: query.product ?? null,
      status: query.status ?? null,
      now,
      today,
      zone: this.zone,
      holdSince: new Date(now.getTime() - this.holdingMs),
      from: startOfBusinessDay(from, this.zone),
      to: startOfBusinessDay(addDaysToIsoDate(to, 1), this.zone),
    };
    return this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
      const [accounts] = await accountsQuery(db, scope);
      if (!accounts) throw new InternalServerErrorException({ code: 'REPORT_UNAVAILABLE' });
      const sales = await salesQuery(db, scope);
      const credits = await creditsQuery(db, scope);
      const rows = await operationsQuery(db, scope);
      const operations = new Map<ReportStatus, CommercialReport['operations'][number]>();
      const users = new Map<string | null, number>();
      for (const row of rows) {
        const pages = asNumber(row.pages);
        const op = operations.get(row.status) ?? { status: row.status, count: 0, pages: 0 };
        op.count += asNumber(row.total);
        op.pages += pages;
        operations.set(row.status, op);
        if (pages > 0) users.set(row.userId, (users.get(row.userId) ?? 0) + pages);
      }
      return {
        window: { from, to, asOf: now.toISOString(), zone: this.zone },
        accounts: {
          registered: asNumber(accounts.registered),
          free: asNumber(accounts.free),
          personalActive: asNumber(accounts.personalActive),
          expired: asNumber(accounts.expired),
          cancelled: asNumber(accounts.cancelled),
          freeCohort: asNumber(accounts.freeCohort),
          converted: asNumber(accounts.converted),
        },
        sales: sales.map((sale) => ({
          product: sale.product,
          kind: sale.kind,
          currency: sale.currency,
          payments: asNumber(sale.payments),
          pagesSold: asNumber(sale.pagesSold),
          revenueCents: asNumber(decimalToCents(sale.revenue)),
          activeMonthlyCents: asNumber(decimalToCents(sale.activeMonthly)),
        })),
        credits: credits.map((credit) => ({
          product: credit.product,
          granted: asNumber(credit.granted),
          available: asNumber(credit.available),
          held: asNumber(credit.held),
          expired: asNumber(credit.expired),
          consumed: asNumber(credit.consumed),
          estimatedCostCents: this.estimatedCost(asNumber(credit.consumed)),
        })),
        operations: [...operations.values()].sort((a, b) => a.status.localeCompare(b.status)),
        users: [...users]
          .map(([userId, pages]) => ({
            userId,
            pages,
            estimatedCostCents: this.estimatedCost(pages),
          }))
          .sort((a, b) => b.pages - a.pages || (a.userId ?? '').localeCompare(b.userId ?? '')),
        estimatedCostPerPagePen: this.cost?.toString() ?? null,
      };
    });
  }

  private estimatedCost(pages: number): number | null {
    return this.cost === null ? null : asNumber(decimalToCents(this.cost.mul(pages)));
  }
}

function asNumber(value: number | bigint | Prisma.Decimal): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new InternalServerErrorException({ code: 'REPORT_UNAVAILABLE' });
  return number;
}
