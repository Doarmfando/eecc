import type { ReactNode } from 'react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCount, formatSoles } from '@/lib/format';
import { cn } from '@/lib/utils';

import { BANK_ACCENTS } from './bank-accent';
import type { FinancialStatement } from './types';

export function StatementSelector({
  statements,
  onConfirm,
}: {
  statements: readonly FinancialStatement[];
  onConfirm: (selectedIds: ReadonlySet<string>) => void;
}): ReactNode {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(statements.map((statement) => statement.id)),
  );

  const toggle = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allSelected = selectedIds.size === statements.length;
  const toggleAll = (): void => {
    setSelectedIds(allSelected ? new Set() : new Set(statements.map((statement) => statement.id)));
  };

  return (
    <Card className="mx-auto w-full max-w-2xl gap-6 rounded-2xl">
      <CardHeader>
        <CardTitle>Elige los estados de cuenta a analizar</CardTitle>
        <CardDescription>
          Son los documentos ya procesados en tu historial. Puedes dejarlos todos marcados o elegir
          solo algunos antes de consolidar.
        </CardDescription>
      </CardHeader>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={toggleAll}
          className="cursor-pointer text-sm font-medium text-primary hover:underline"
        >
          {allSelected ? 'Quitar todos' : 'Marcar todos'}
        </button>
        <span className="text-xs text-muted-foreground">
          {formatCount(selectedIds.size)} de {formatCount(statements.length)} seleccionados
        </span>
      </div>

      <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto rounded-xl border border-border/60">
        {statements.map((statement) => {
          const accent = BANK_ACCENTS[statement.bancoOrigen];
          const checked = selectedIds.has(statement.id);
          return (
            <li key={statement.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-accent/50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    toggle(statement.id);
                  }}
                  className={cn(
                    'size-4 shrink-0 rounded border-border text-primary',
                    'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
                  )}
                />
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    accent.badgeClassName,
                  )}
                >
                  <img
                    src={accent.logo}
                    alt=""
                    aria-hidden
                    className="h-4 w-auto max-w-6 object-contain"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {accent.name} — {statement.periodoLabel}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatCount(statement.movimientos.length)} movimientos · Saldo final{' '}
                    {formatSoles(statement.saldoFinal)}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={selectedIds.size === 0}
        onClick={() => {
          onConfirm(selectedIds);
        }}
      >
        Consolidar y analizar
      </Button>
    </Card>
  );
}
