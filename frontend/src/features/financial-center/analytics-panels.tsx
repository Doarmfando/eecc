import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCount, formatSoles } from '@/lib/format';

import { BANK_ACCENTS } from './bank-accent';
import type { BankDistributionItem, FlowBreakdown } from './use-financial-center';

export function BankDistributionCard({
  items,
}: {
  items: readonly BankDistributionItem[];
}): ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución por banco</CardTitle>
        <CardDescription>Movimientos filtrados, agrupados por entidad emisora.</CardDescription>
      </CardHeader>

      <ul className="flex flex-col gap-4">
        {items.map((item) => {
          const accent = BANK_ACCENTS[item.bankId];
          return (
            <li key={item.bankId} className="flex items-center gap-3">
              <img
                src={accent.logo}
                alt=""
                aria-hidden
                className="h-5 w-16 shrink-0 object-contain object-left"
              />
              <div className="min-w-0 flex-1">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${accent.barClassName}`}
                    style={{ width: `${String(Math.round(item.share * 100))}%` }}
                  />
                </div>
              </div>
              <div className="w-32 shrink-0 text-right">
                <p className="text-sm font-semibold text-foreground">{formatCount(item.count)}</p>
                <p className="text-xs text-muted-foreground">{formatSoles(item.amountCents)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function FlowBreakdownCard({ breakdown }: { breakdown: FlowBreakdown }): ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entradas vs. salidas</CardTitle>
        <CardDescription>Abonos y cargos del periodo filtrado.</CardDescription>
      </CardHeader>

      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium text-success">
              <ArrowUpRight aria-hidden className="size-4" />
              Abonos
            </span>
            <span className="font-semibold text-foreground">
              {formatSoles(breakdown.incomeCents)}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${String(Math.round(breakdown.incomeShare * 100))}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium text-destructive">
              <ArrowDownRight aria-hidden className="size-4" />
              Cargos
            </span>
            <span className="font-semibold text-foreground">
              {formatSoles(breakdown.expenseCents)}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-destructive"
              style={{ width: `${String(Math.round(breakdown.expenseShare * 100))}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
