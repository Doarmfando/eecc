import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { BankId } from '@/features/statements/bank-selector';
import { cn } from '@/lib/utils';

import { ALL_BANK_IDS } from './use-financial-center';
import { BANK_ACCENTS } from './bank-accent';

const pillClass =
  'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors';

function AllBanksPill({ active, onClick }: { active: boolean; onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        pillClass,
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      Todos los bancos
    </button>
  );
}

function BankPill({
  bankId,
  active,
  onClick,
}: {
  bankId: BankId;
  active: boolean;
  onClick: () => void;
}): ReactNode {
  const accent = BANK_ACCENTS[bankId];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        pillClass,
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      <img src={accent.logo} alt="" aria-hidden className="h-4 w-auto max-w-8 object-contain" />
      {accent.name}
    </button>
  );
}

export function FilterBar({
  selectedBanks,
  onToggleBank,
  onSelectAllBanks,
  search,
  onSearchChange,
  monthFrom,
  onMonthFromChange,
  monthTo,
  onMonthToChange,
  monthBounds,
}: {
  selectedBanks: ReadonlySet<BankId>;
  onToggleBank: (bankId: BankId) => void;
  onSelectAllBanks: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  monthFrom: string;
  onMonthFromChange: (value: string) => void;
  monthTo: string;
  onMonthToChange: (value: string) => void;
  monthBounds: { min: string; max: string };
}): ReactNode {
  return (
    <Card className="gap-5 p-5 sm:p-5">
      <div role="group" aria-label="Filtrar por banco" className="flex flex-wrap gap-2">
        <AllBanksPill active={selectedBanks.size === 0} onClick={onSelectAllBanks} />
        {ALL_BANK_IDS.map((bankId) => (
          <BankPill
            key={bankId}
            bankId={bankId}
            active={selectedBanks.has(bankId)}
            onClick={() => {
              onToggleBank(bankId);
            }}
          />
        ))}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Desde
            <Input
              type="month"
              value={monthFrom}
              min={monthBounds.min}
              max={monthTo || monthBounds.max}
              onChange={(event) => {
                onMonthFromChange(event.target.value);
              }}
              className="w-40"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Hasta
            <Input
              type="month"
              value={monthTo}
              min={monthFrom || monthBounds.min}
              max={monthBounds.max}
              onChange={(event) => {
                onMonthToChange(event.target.value);
              }}
              className="w-40"
            />
          </label>
        </div>

        <div className="relative w-full sm:max-w-sm">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            placeholder="Buscar por descripción: SUNAT, Nómina, Proveedor…"
            aria-label="Buscar movimientos por descripción o categoría"
            onChange={(event) => {
              onSearchChange(event.target.value);
            }}
            className="pl-9"
          />
        </div>
      </div>
    </Card>
  );
}
