import { Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BankMark } from '@/features/financial-center/bank-mark';
import type { FinancialTransaction } from '@/features/financial-center/types';
import { formatCount, formatMoney } from '@/lib/format';
import { getMonthLabel, getMonthShortLabel } from '@/lib/month';
import { cn } from '@/lib/utils';

/** Resultados que se pintan de entrada; «Ver más» suma otros tantos. */
const PAGE_SIZE = 25;

const DAY_FORMATTER = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' });

function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return year && month && day ? DAY_FORMATTER.format(new Date(year, month - 1, day)) : isoDate;
}

interface MonthGroup {
  month: string;
  items: FinancialTransaction[];
}

function groupByMonth(transactions: readonly FinancialTransaction[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7);
    const last = groups.at(-1);
    if (last?.month === month) {
      last.items.push(transaction);
    } else {
      groups.push({ month, items: [transaction] });
    }
  }
  return groups;
}

/**
 * Lo que encontró el buscador en todos los meses y años, agrupado por el mes de
 * la fecha del movimiento. Cada resultado lleva a su día en el calendario y dice
 * de qué estado de cuenta viene cuando es de otro mes (un cargo de diciembre
 * impreso en el de enero).
 */
export function GlobalSearchResults({
  search,
  matches,
  periodOf,
  selectedDate,
  onGoToDate,
}: {
  search: string;
  /** Más reciente primero. */
  matches: readonly FinancialTransaction[];
  /** Mes (`YYYY-MM`) del documento de cada movimiento. */
  periodOf: (statementId: string) => string | undefined;
  selectedDate: string | null;
  onGoToDate: (date: string) => void;
}): ReactNode {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = matches.slice(0, visible);
  const groups = groupByMonth(shown);
  const monthCount = new Set(matches.map((transaction) => transaction.date.slice(0, 7))).size;

  return (
    <Card
      role="region"
      aria-label="Resultados en todos los meses"
      className="gap-3 rounded-3xl p-4 sm:p-5"
    >
      <div className="flex items-start gap-2">
        <Search aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">En todos los meses</h2>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {matches.length === 0
              ? `Nada coincide con «${search.trim()}» en ningún mes.`
              : `${formatCount(matches.length)} ${matches.length === 1 ? 'coincidencia' : 'coincidencias'} en ${formatCount(monthCount)} ${monthCount === 1 ? 'mes' : 'meses'}. Elige una para ir a su día.`}
          </p>
        </div>
      </div>

      {groups.length > 0 ? (
        <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {groups.map((group) => (
            <div key={group.month}>
              <p className="sticky top-0 bg-card py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {getMonthLabel(group.month)}
              </p>
              <ul className="divide-y divide-border">
                {group.items.map((transaction) => {
                  const isIncome = transaction.type === 'ABONO';
                  const period = periodOf(transaction.statementId);
                  const fromOtherPeriod = period !== undefined && period !== group.month;
                  return (
                    <li key={transaction.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onGoToDate(transaction.date);
                        }}
                        aria-current={selectedDate === transaction.date ? 'date' : undefined}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-3 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-accent',
                          'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-1',
                          selectedDate === transaction.date ? 'bg-primary/8' : '',
                        )}
                      >
                        <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                          {formatDay(transaction.date)}
                        </span>
                        <BankMark
                          bankId={transaction.bankId}
                          labelled
                          className="max-h-4 w-7 shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">
                            {transaction.description}
                          </span>
                          {fromOtherPeriod ? (
                            <span className="block text-[11px] text-muted-foreground">
                              En el estado de cuenta de {getMonthShortLabel(period)}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-sm font-semibold tabular-nums',
                            isIncome ? 'text-success' : 'text-foreground/80',
                          )}
                        >
                          {isIncome ? '+' : '−'}{' '}
                          {formatMoney(transaction.amountCents, transaction.currency)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {matches.length > shown.length ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setVisible((current) => current + PAGE_SIZE);
          }}
        >
          Ver más ({formatCount(matches.length - shown.length)})
        </Button>
      ) : null}
    </Card>
  );
}
