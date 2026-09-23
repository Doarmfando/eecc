import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCount, formatSoles } from '@/lib/format';
import { cn } from '@/lib/utils';

import { BankMark } from './bank-mark';
import type { FinancialTransaction } from './types';
import type { TransactionGroup } from './use-financial-center';

const GROUP_DATE_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatGroupDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }
  return GROUP_DATE_FORMATTER.format(new Date(year, month - 1, day));
}

function TransactionRow({ transaction }: { transaction: FinancialTransaction }): ReactNode {
  const isIncome = transaction.type === 'ABONO';

  return (
    <li className="flex items-center gap-3 py-3.5">
      <BankMark
        bankId={transaction.bankId}
        labelled
        className="h-7 w-11 shrink-0 object-left text-muted-foreground"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-foreground">
          {transaction.description}
        </p>
        <p className="text-xs text-muted-foreground">{transaction.category}</p>
      </div>
      {transaction.reconciled ? (
        <CheckCircle2
          aria-label="Verificado"
          className="size-3.5 shrink-0 text-muted-foreground/70"
        />
      ) : null}
      <span
        className={cn(
          'w-28 shrink-0 text-right text-base font-semibold',
          isIncome ? 'text-success' : 'text-foreground/80',
        )}
      >
        {isIncome ? '+' : '−'} {formatSoles(transaction.amountCents)}
      </span>
    </li>
  );
}

export function MovementsList({
  groups,
  totalCount,
  shownCount,
  search,
  canShowMore,
  canShowLess,
  onShowMore,
  onShowLess,
}: {
  groups: readonly TransactionGroup[];
  totalCount: number;
  shownCount: number;
  search: string;
  canShowMore: boolean;
  canShowLess: boolean;
  onShowMore: () => void;
  onShowLess: () => void;
}): ReactNode {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Movimientos</CardTitle>
        <CardDescription>
          {search.trim()
            ? `Coincidencias con "${search.trim()}", más recientes primero.`
            : 'Del mes y los bancos que tienes filtrados, más recientes primero.'}
        </CardDescription>
      </CardHeader>

      {groups.length > 0 ? (
        <div className="flex flex-col">
          {groups.map((group) => (
            <div key={group.date}>
              <p className="py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {formatGroupDate(group.date)}
              </p>
              <ul className="divide-y divide-border">
                {group.items.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No hay movimientos para este filtro.</p>
      )}

      {canShowMore || canShowLess ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">
            Mostrando {formatCount(shownCount)} de {formatCount(totalCount)} movimientos.
          </p>
          <div className="flex gap-2">
            {canShowLess ? (
              <Button type="button" variant="ghost" size="sm" onClick={onShowLess}>
                <ChevronUp aria-hidden />
                Ver menos
              </Button>
            ) : null}
            {canShowMore ? (
              <Button type="button" variant="outline" size="sm" onClick={onShowMore}>
                <ChevronDown aria-hidden />
                Cargar más
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
