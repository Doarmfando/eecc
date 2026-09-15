import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { formatSoles } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { FlowTotals } from './use-financial-center';

export function NetFlowHero({ totals }: { totals: FlowTotals }): ReactNode {
  const maxCents = Math.max(1, totals.incomeCents, totals.expenseCents);
  const incomeShare = Math.round((totals.incomeCents / maxCents) * 100);
  const expenseShare = Math.round((totals.expenseCents / maxCents) * 100);
  const isPositive = totals.netCents >= 0;

  return (
    <Card className="gap-6 rounded-2xl">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Flujo neto consolidado</p>
        <p
          className={cn(
            'mt-1 text-4xl leading-tight font-bold tracking-tight sm:text-5xl',
            isPositive ? 'text-success' : 'text-destructive',
          )}
        >
          {isPositive ? '+' : '−'} {formatSoles(Math.abs(totals.netCents))}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
            <ArrowUpRight aria-hidden className="size-4" />
            Entradas / Abonos
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {formatSoles(totals.incomeCents)}
          </p>
          <div className="mt-2 h-4 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success transition-[width]"
              style={{ width: `${String(incomeShare)}%` }}
            />
          </div>
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <ArrowDownRight aria-hidden className="size-4" />
            Salidas / Cargos
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {formatSoles(totals.expenseCents)}
          </p>
          <div className="mt-2 h-4 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-destructive transition-[width]"
              style={{ width: `${String(expenseShare)}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
