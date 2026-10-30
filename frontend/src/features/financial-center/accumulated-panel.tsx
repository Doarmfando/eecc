import { ArrowDownRight, ArrowUpRight, CheckCircle2, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { formatCount, formatMoney, type Currency } from '@/lib/format';
import { getMonthLabel, getMonthShortLabel } from '@/lib/month';
import { cn } from '@/lib/utils';

import { BankMark } from './bank-mark';
import { consolidatedBalance, type ConsolidatedBalance, type LedgerAccount } from './ledger';
import { accountLabel } from './ledger-labels';

function range(from: string, to: string): string {
  return from === to
    ? getMonthLabel(from)
    : `${getMonthShortLabel(from)} – ${getMonthShortLabel(to)}`;
}

const NO_BALANCE_REASONS: Record<
  Exclude<ConsolidatedBalance, { kind: 'CONCILIADO' }>['motivo'],
  string
> = {
  CADENA_INCOMPLETA:
    'Alguna cuenta tiene meses sin documento, periodos repetidos o un saldo inicial que no sigue al final anterior.',
  PERIODOS_DISTINTOS:
    'Las cuentas no cubren los mismos meses: sumar sus saldos mezclaría fechas distintas.',
  SIN_CUENTAS: 'No hay cuentas con el filtro actual.',
};

/**
 * Entradas y salidas de todos los periodos marcados, y el saldo de cada cuenta
 * de punta a punta. Los saldos no se suman entre meses: el inicial es el del
 * primer documento de la cuenta y el final, el del último.
 */
export function AccumulatedPanel({
  accounts,
  currency,
  movementCount,
}: {
  accounts: readonly LedgerAccount[];
  currency: Currency;
  movementCount: number;
}): ReactNode {
  const abonos = accounts.reduce((total, account) => total + account.abonos, 0);
  const cargos = accounts.reduce((total, account) => total + account.cargos, 0);
  const netCents = abonos - cargos;
  const documents = accounts.reduce((total, account) => total + account.statements.length, 0);
  const months = accounts
    .flatMap((account) => [account.primerPeriodo, account.ultimoPeriodo])
    .sort();
  const balance = consolidatedBalance(accounts);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <Card className="gap-6 rounded-2xl xl:col-span-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Flujo neto acumulado</p>
          <p
            className={cn(
              'mt-1 text-4xl leading-tight font-bold tracking-tight sm:text-5xl',
              netCents >= 0 ? 'text-success' : 'text-destructive',
            )}
          >
            {netCents >= 0 ? '+' : '−'} {formatMoney(Math.abs(netCents), currency)}
          </p>
          {months.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {range(months[0] ?? '', months.at(-1) ?? '')} · {formatCount(documents)}{' '}
              {documents === 1 ? 'documento' : 'documentos'} · {formatCount(movementCount)}{' '}
              movimientos
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
              <ArrowUpRight aria-hidden className="size-4" />
              Entradas acumuladas
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {formatMoney(abonos, currency)}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
              <ArrowDownRight aria-hidden className="size-4" />
              Salidas acumuladas
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {formatMoney(cargos, currency)}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Suma de lo que declara cada estado de cuenta. Es flujo, no saldo: los saldos de meses
          distintos no se suman.
        </p>
      </Card>

      <Card className="gap-4 rounded-2xl xl:col-span-2">
        <h2 className="text-lg font-semibold text-foreground">Saldos por cuenta</h2>
        <ul className="flex flex-col gap-3">
          {accounts.map((account) => (
            <li key={account.key} className="rounded-2xl border border-border/60 p-4">
              <div className="flex items-center gap-3">
                <BankMark bankId={account.bankId} className="max-h-6 w-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {accountLabel(account)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {range(account.primerPeriodo, account.ultimoPeriodo)} ·{' '}
                    {formatCount(account.statements.length)}{' '}
                    {account.statements.length === 1 ? 'documento' : 'documentos'}
                  </p>
                </div>
                {account.continua ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                    <CheckCircle2 aria-hidden className="size-3.5" />
                    Continua
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                    <TriangleAlert aria-hidden className="size-3.5" />
                    Con saltos
                  </span>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Saldo inicial · {getMonthShortLabel(account.primerPeriodo)}
                  </dt>
                  <dd className="font-semibold text-foreground">
                    {formatMoney(account.saldoInicial, account.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Saldo final · {getMonthShortLabel(account.ultimoPeriodo)}
                  </dt>
                  <dd
                    className={cn(
                      'font-semibold',
                      account.continua ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {formatMoney(account.saldoFinal, account.currency)}
                  </dd>
                </div>
              </dl>
              {!account.continua ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Es el saldo que declara su último documento; la cadena tiene saltos, así que no
                  queda conciliado con el inicial.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="border-t border-border/60 pt-3">
          {balance.kind === 'CONCILIADO' ? (
            <p className="text-sm">
              <span className="text-muted-foreground">
                Saldo consolidado al cierre de {getMonthLabel(balance.hasta)}:{' '}
              </span>
              <span className="font-bold text-foreground">
                {formatMoney(balance.saldoFinal, currency)}
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Sin saldo global conciliado.</span>{' '}
              {NO_BALANCE_REASONS[balance.motivo]}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
