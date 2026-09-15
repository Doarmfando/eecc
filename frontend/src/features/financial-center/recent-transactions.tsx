import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatSoles } from '@/lib/format';
import { cn } from '@/lib/utils';

import { BANK_ACCENTS } from './bank-accent';
import type { FinancialTransaction } from './types';

const MAX_ROWS = 15;

const DATE_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function formatMovementDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }
  return DATE_FORMATTER.format(new Date(year, month - 1, day));
}

function TransactionRow({ transaction }: { transaction: FinancialTransaction }): ReactNode {
  const accent = BANK_ACCENTS[transaction.bankId];
  const isIncome = transaction.type === 'ABONO';

  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          accent.badgeClassName,
        )}
      >
        <img src={accent.logo} alt="" aria-hidden className="h-3 w-auto max-w-6 object-contain" />
        {accent.name}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{transaction.description}</p>
        <p className="text-xs text-muted-foreground">
          {transaction.category} · {formatMovementDate(transaction.date)}
          {!transaction.reconciled && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-warning-foreground">
              <TriangleAlert aria-hidden className="size-3" />
              Sin reconciliar
            </span>
          )}
        </p>
      </div>

      <span
        className={cn(
          'shrink-0 text-sm font-semibold',
          isIncome ? 'text-success' : 'text-destructive',
        )}
      >
        {isIncome ? '+' : '−'} {formatSoles(transaction.amountCents)}
      </span>
    </li>
  );
}

export function RecentTransactionsCard({
  transactions,
  search,
}: {
  transactions: readonly FinancialTransaction[];
  search: string;
}): ReactNode {
  const rows = transactions.slice(0, MAX_ROWS);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patrones y movimientos recientes</CardTitle>
        <CardDescription>
          {search.trim()
            ? `Coincidencias con "${search.trim()}", más recientes primero.`
            : 'Los más recientes según los filtros activos.'}
        </CardDescription>
      </CardHeader>

      {rows.length > 0 ? (
        <ul className="divide-y divide-border">
          {rows.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No se encontraron movimientos con estos filtros.
        </p>
      )}

      {transactions.length > MAX_ROWS ? (
        <p className="text-xs text-muted-foreground">
          Se muestran {MAX_ROWS} de {transactions.length} movimientos filtrados.
        </p>
      ) : null}
    </Card>
  );
}
