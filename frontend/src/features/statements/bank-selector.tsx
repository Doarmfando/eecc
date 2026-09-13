import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import bbvaLogo from '@/assets/banks/bbva.svg';
import bcpLogo from '@/assets/banks/bcp.svg';
import interbankLogo from '@/assets/banks/interbank.svg';
import scotiabankLogo from '@/assets/banks/scotiabank.svg';

export type BankId = 'bcp' | 'bbva' | 'interbank' | 'scotiabank';

interface BankOption {
  id: BankId;
  name: string;
  logo: string;
  available: boolean;
}

const BANK_OPTIONS: ReadonlyArray<BankOption> = [
  { id: 'bcp', name: 'BCP', logo: bcpLogo, available: true },
  { id: 'bbva', name: 'BBVA', logo: bbvaLogo, available: false },
  { id: 'interbank', name: 'Interbank', logo: interbankLogo, available: false },
  { id: 'scotiabank', name: 'Scotiabank', logo: scotiabankLogo, available: false },
];

export const BANK_NAMES: Record<BankId, string> = Object.fromEntries(
  BANK_OPTIONS.map((bank) => [bank.id, bank.name]),
) as Record<BankId, string>;

export function BankSelector({
  value,
  onChange,
}: {
  value: BankId;
  onChange: (bank: BankId) => void;
}): ReactNode {
  return (
    <div>
      <p className="text-xs font-bold tracking-wider text-slate-400 uppercase">
        1. Banco de origen
      </p>

      <div role="radiogroup" aria-label="Banco emisor del estado de cuenta" className="mt-3">
        <div className="flex flex-col gap-3">
          {BANK_OPTIONS.map((bank) => {
            const selected = bank.available && bank.id === value;
            return (
              <button
                key={bank.id}
                type="button"
                role="radio"
                aria-checked={selected}
                title={bank.available ? bank.name : `${bank.name} — próximamente`}
                disabled={!bank.available}
                onClick={() => {
                  if (bank.available) {
                    onChange(bank.id);
                  }
                }}
                className={cn(
                  'group flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200',
                  bank.available
                    ? selected
                      ? 'border-2 border-blue-600 bg-blue-50/60'
                      : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm'
                    : 'cursor-not-allowed border-slate-200 bg-slate-50/60',
                )}
              >
                <img
                  src={bank.logo}
                  alt={bank.name}
                  className={cn(
                    'h-6 w-auto max-w-16 shrink-0 object-contain',
                    bank.available
                      ? ''
                      : 'grayscale opacity-50 transition-all duration-200 group-hover:opacity-80 group-hover:grayscale-0',
                  )}
                />

                <span
                  className={cn(
                    'flex-1 truncate text-sm',
                    selected
                      ? 'font-semibold text-foreground'
                      : bank.available
                        ? 'text-foreground'
                        : 'text-slate-400',
                  )}
                >
                  {bank.name}
                </span>

                {selected ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Check aria-hidden className="size-3" strokeWidth={3} />
                  </span>
                ) : !bank.available ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                    Próximamente
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
