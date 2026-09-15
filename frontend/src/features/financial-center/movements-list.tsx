import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { formatCount, formatSoles } from '@/lib/format';
import { cn } from '@/lib/utils';

import { BANK_ACCENTS } from './bank-accent';
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
  const accent = BANK_ACCENTS[transaction.bankId];
  const isIncome = transaction.type === 'ABONO';

  return (
    <li className="flex items-center gap-3 py-3.5">
      <img
        src={accent.logo}
        alt={accent.name}
        title={accent.name}
        className="h-7 w-11 shrink-0 object-contain object-left"
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
}: {
  groups: readonly TransactionGroup[];
  totalCount: number;
  shownCount: number;
}): ReactNode {
  return (
    <Card className="rounded-2xl">
      <h2 className="text-lg font-semibold text-foreground">Movimientos</h2>

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

      {totalCount > shownCount ? (
        <p className="text-xs text-muted-foreground">
          Se muestran los {formatCount(shownCount)} movimientos más recientes de{' '}
          {formatCount(totalCount)}.
        </p>
      ) : null}
    </Card>
  );
}
