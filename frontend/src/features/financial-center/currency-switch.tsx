import type { ReactNode } from 'react';

import { CURRENCY_NAMES, currencySymbol, type Currency } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Selector de moneda; solo se muestra cuando hay documentos en las dos. */
export function CurrencySwitch({
  currencies,
  value,
  onChange,
}: {
  currencies: readonly Currency[];
  value: Currency;
  onChange: (currency: Currency) => void;
}): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div
        role="radiogroup"
        aria-label="Moneda"
        className="inline-flex gap-1 rounded-xl bg-muted p-1"
      >
        {currencies.map((currency) => (
          <button
            key={currency}
            type="button"
            role="radio"
            aria-checked={value === currency}
            onClick={() => {
              onChange(currency);
            }}
            className={cn(
              'cursor-pointer rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors',
              value === currency
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="font-semibold">{currencySymbol(currency)}</span>{' '}
            {CURRENCY_NAMES[currency]}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Tienes cuentas en soles y en dólares: se muestran por separado, sin sumarlas.
      </p>
    </div>
  );
}
