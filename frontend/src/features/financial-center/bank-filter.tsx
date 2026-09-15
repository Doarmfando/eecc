import type { ReactNode } from 'react';

import type { BankId } from '@/features/statements/bank-selector';
import { cn } from '@/lib/utils';

import { BANK_ACCENTS } from './bank-accent';
import { ALL_BANK_IDS } from './use-financial-center';

const pillClass =
  'inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors';

export function BankFilterPills({
  selectedBanks,
  onToggleBank,
  onSelectAllBanks,
}: {
  selectedBanks: ReadonlySet<BankId>;
  onToggleBank: (bankId: BankId) => void;
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
      {ALL_BANK_IDS.map((bankId) => {
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
            <img
              src={accent.logo}
              alt=""
              aria-hidden
              className="h-4 w-auto max-w-8 object-contain"
            />
            {accent.name}
          </button>
        );
      })}
    </div>
  );
}
