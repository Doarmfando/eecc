import { Check, Landmark } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import bbvaLogo from '@/assets/banks/bbva.png';
import bcpLogo from '@/assets/banks/bcp.png';
import interbankLogo from '@/assets/banks/interbank.webp';
import scotiabankLogo from '@/assets/banks/scotiabank.webp';

export type BankId = 'bcp' | 'bbva' | 'interbank' | 'nacion' | 'scotiabank';

interface BankOption {
  id: BankId;
  name: string;
  /** `null` cuando el proyecto no tiene su logotipo: se dibuja el nombre con un ícono. */
  logo: string | null;
  available: boolean;
}

/** Disponible = el worker tiene un extractor validado con un estado de cuenta real del banco. */
const BANK_OPTIONS: ReadonlyArray<BankOption> = [
  { id: 'bcp', name: 'BCP', logo: bcpLogo, available: true },
  { id: 'bbva', name: 'BBVA', logo: bbvaLogo, available: true },
  { id: 'interbank', name: 'Interbank', logo: interbankLogo, available: true },
  { id: 'nacion', name: 'Banco de la Nación', logo: null, available: true },
  { id: 'scotiabank', name: 'Scotiabank', logo: scotiabankLogo, available: false },
];

export const BANK_NAMES: Record<BankId, string> = Object.fromEntries(
  BANK_OPTIONS.map((bank) => [bank.id, bank.name]),
) as Record<BankId, string>;

/** Bancos con extractor propio. El worker detecta la plantilla por sí mismo. */
export const AVAILABLE_BANKS: ReadonlySet<BankId> = new Set(
  BANK_OPTIONS.filter((bank) => bank.available).map((bank) => bank.id),
);

const LIST_FORMAT = new Intl.ListFormat('es', { style: 'long', type: 'conjunction' });

/** «BCP, BBVA, Interbank y Banco de la Nación»: sale de la lista, no se repite a mano. */
export const AVAILABLE_BANKS_LABEL = LIST_FORMAT.format(
  BANK_OPTIONS.filter((bank) => bank.available).map((bank) => bank.name),
);

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
                      ? 'cursor-pointer border-2 border-blue-600 bg-blue-50/60'
                      : 'cursor-pointer border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm'
                    : 'cursor-not-allowed border-slate-200 bg-slate-50/60',
                )}
              >
                {bank.logo ? (
                  <span className="flex h-9 w-20 shrink-0 items-center justify-start">
                    <img
                      src={bank.logo}
                      alt={bank.name}
                      className={cn(
                        'max-h-full max-w-full object-contain object-left',
                        bank.available
                          ? ''
                          : 'grayscale opacity-50 transition-all duration-200 group-hover:opacity-80 group-hover:grayscale-0',
                      )}
                    />
                  </span>
                ) : (
                  // Sin logotipo propio no se imita una marca ajena: ícono neutro y nombre.
                  <span className="flex h-9 min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
                    <Landmark aria-hidden className="size-5 shrink-0 text-slate-500" />
                    <span className="truncate">{bank.name}</span>
                  </span>
                )}

                <span className="flex-1" />

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
