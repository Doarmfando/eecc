import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { formatCount, formatSoles } from '@/lib/format';
import { cn } from '@/lib/utils';

import { BANK_ACCENTS, type SourceBankId } from './bank-accent';
import { BankMark } from './bank-mark';
import type { BankBalance } from './use-financial-center';

export function AccountsConsolidated({
  balances,
  selectedBanks,
}: {
  balances: readonly BankBalance[];
  selectedBanks: ReadonlySet<SourceBankId>;
}): ReactNode {
  return (
    <Card className="gap-4 rounded-2xl">
      <h2 className="text-lg font-semibold text-foreground">Cuentas consolidadas</h2>

      <ul className="flex flex-col gap-3">
        {balances.map((balance) => {
          const accent = BANK_ACCENTS[balance.bankId];
          const dimmed = selectedBanks.size > 0 && !selectedBanks.has(balance.bankId);
          return (
            <li
              key={balance.bankId}
              className={cn(
                'flex items-center gap-4 rounded-2xl border border-border/60 p-4 transition-opacity',
                dimmed ? 'opacity-40' : '',
              )}
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                <BankMark bankId={balance.bankId} className="h-6 w-auto max-w-8" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-muted-foreground">{accent.name}</p>
                <p className="text-2xl leading-tight font-bold text-foreground">
                  {formatSoles(balance.balanceCents)}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {formatCount(balance.movementCount)} mov.
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
