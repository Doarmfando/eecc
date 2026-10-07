import { useMemo, useState } from 'react';

import type { Currency } from '@/lib/format';

import type { FinancialStatement } from './types';

const CURRENCY_ORDER: readonly Currency[] = ['PEN', 'USD'];

/** Monedas de los documentos cargados, soles primero. */
export function statementCurrencies(statements: readonly FinancialStatement[]): Currency[] {
  const present = new Set(statements.map((statement) => statement.moneda));
  return CURRENCY_ORDER.filter((currency) => present.has(currency));
}

export interface CurrencyFilter {
  /** Monedas presentes. Con más de una hay que elegir: soles y dólares no se suman. */
  currencies: Currency[];
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  /** Solo los documentos en `currency`: lo que la vista puede consolidar. */
  statements: FinancialStatement[];
}

/**
 * Una vista consolida una sola moneda a la vez.
 *
 * Sumar el saldo de una cuenta en soles con el de una en dólares da un número que
 * no es de ninguna cuenta. Con una moneda no hay nada que elegir; con las dos se
 * empieza por soles.
 */
export function useCurrencyFilter(statements: readonly FinancialStatement[]): CurrencyFilter {
  const currencies = useMemo(() => statementCurrencies(statements), [statements]);
  const [chosen, setChosen] = useState<Currency | null>(null);
  const currency =
    chosen !== null && currencies.includes(chosen) ? chosen : (currencies[0] ?? 'PEN');
  const inCurrency = useMemo(
    () => statements.filter((statement) => statement.moneda === currency),
    [statements, currency],
  );
  return { currencies, currency, setCurrency: setChosen, statements: inCurrency };
}
