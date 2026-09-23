import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { BANK_ACCENTS, type SourceBankId } from './bank-accent';
import { BankMark } from './bank-mark';

const pillClass =
  'inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors';

export function BankFilterPills({
  banks,
  selectedBanks,
  onToggleBank,
  onSelectAllBanks,
}: {
  banks: readonly SourceBankId[];
  selectedBanks: ReadonlySet<SourceBankId>;
  onToggleBank: (bankId: SourceBankId) => void;
  onSelectAllBanks: () => void;
}): ReactNode {
  return (
    <div role="group" aria-label="Filtrar por banco" className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={selectedBanks.size === 0}
        onClick={onSelectAllBanks}
        className={cn(
          pillClass,
          selectedBanks.size === 0
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
        )}
      >
        Todos los bancos
      </button>
      {banks.map((bankId) => {
        const accent = BANK_ACCENTS[bankId];
        const active = selectedBanks.has(bankId);
        return (
          <button
            key={bankId}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onToggleBank(bankId);
            }}
            className={cn(
              pillClass,
              active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            <BankMark bankId={bankId} className="h-4 w-auto max-w-8" />
            {accent.name}
          </button>
        );
      })}
    </div>
  );
}
