import { Filter } from 'lucide-react';
import type { ReactNode } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { SourceBankId } from '@/features/financial-center/bank-accent';
import { BankFilterPills } from '@/features/financial-center/bank-filter';
import { cn } from '@/lib/utils';

/**
 * Filtro de bancos plegado tras un solo botón: en móvil, los cinco pills sueltos
 * ocupaban tres filas encima del calendario. El contador deja ver que hay un
 * filtro puesto sin necesidad de abrirlo.
 */
export function BankFilterMenu({
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
  const activeCount = selectedBanks.size;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            activeCount === 0
              ? 'Filtrar por banco (todos)'
              : `Filtrar por banco (${String(activeCount)} seleccionado${activeCount === 1 ? '' : 's'})`
          }
          className={cn(
            'relative flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border bg-card transition-colors',
            activeCount > 0
              ? 'border-primary/40 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          <Filter aria-hidden className="size-[18px]" />
          {activeCount > 0 ? (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
            >
              {activeCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-4">
        <p className="pb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Bancos
        </p>
        <BankFilterPills
          banks={banks}
          selectedBanks={selectedBanks}
          onToggleBank={onToggleBank}
          onSelectAllBanks={onSelectAllBanks}
        />
      </PopoverContent>
    </Popover>
  );
}
