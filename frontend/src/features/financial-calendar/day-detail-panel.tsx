import { CalendarDays, CheckCircle2, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { BANK_ACCENTS } from '@/features/financial-center/bank-accent';
import { BankMark } from '@/features/financial-center/bank-mark';
import type { FinancialTransaction } from '@/features/financial-center/types';
import { formatSoles } from '@/lib/format';
import { cn } from '@/lib/utils';

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatDayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }
  const label = DAY_LABEL_FORMATTER.format(new Date(year, month - 1, day));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function TransactionRow({ transaction }: { transaction: FinancialTransaction }): ReactNode {
  const accent = BANK_ACCENTS[transaction.bankId];
  const isIncome = transaction.type === 'ABONO';

  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
          accent.badgeClassName,
        )}
      >
        <BankMark bankId={transaction.bankId} labelled className="h-5 w-8" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{transaction.description}</p>
        <p className="text-xs text-muted-foreground">{transaction.category}</p>
      </div>
      {transaction.reconciled ? (
        <CheckCircle2 aria-label="Verificado" className="size-4 shrink-0 text-success/70" />
      ) : null}
      <span
        className={cn(
          'w-24 shrink-0 text-right text-sm font-semibold',
          isIncome ? 'text-success' : 'text-foreground/80',
        )}
      >
        {isIncome ? '+' : '−'} {formatSoles(transaction.amountCents)}
      </span>
    </li>
  );
}

export function DayDetailPanel({
  selectedDate,
  transactions,
  onClear,
}: {
  selectedDate: string | null;
  transactions: readonly FinancialTransaction[];
  onClear: () => void;
}): ReactNode {
  if (!selectedDate) {
    return (
      <Card className="items-center justify-center gap-3 rounded-2xl py-12 text-center">
        <CalendarDays aria-hidden className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Elige un día del calendario para ver el detalle de sus movimientos.
        </p>
      </Card>
    );
  }

  return (
    <Card className="gap-4 rounded-2xl">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">{formatDayLabel(selectedDate)}</h2>
        <button
          type="button"
          onClick={onClear}
          aria-label="Cerrar el detalle del día"
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>

      {transactions.length > 0 ? (
        <ul className="divide-y divide-border">
          {transactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Ese día no registra movimientos.</p>
      )}
    </Card>
  );
}
