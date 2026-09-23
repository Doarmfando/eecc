import type { ReactNode } from 'react';
import { useState } from 'react';

import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatProcessedAt } from '@/features/statements/format-processed-at';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { JobListItem } from '@/types/job';

import { BANK_ACCENTS, bankFromExtractor } from './bank-accent';
import { BankMark } from './bank-mark';

/**
 * Preselección sobre el historial real.
 *
 * Cada fila es un documento que esta persona procesó; el periodo todavía no se
 * conoce aquí, porque sale de los CSV que se leen al consolidar. Por eso la fila
 * muestra lo que el historial sí sabe: banco detectado, cuándo se procesó y
 * cuántos movimientos trae.
 */
export function StatementSelector({
  jobs,
  onConfirm,
}: {
  jobs: readonly JobListItem[];
  onConfirm: (selectedIds: ReadonlySet<string>) => void;
}): ReactNode {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(jobs.map((job) => job.jobId)),
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

  const allSelected = selectedIds.size === jobs.length;
  const toggleAll = (): void => {
    setSelectedIds(allSelected ? new Set() : new Set(jobs.map((job) => job.jobId)));
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
          {formatCount(selectedIds.size)} de {formatCount(jobs.length)} seleccionados
        </span>
      </div>

      <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto rounded-xl border border-border/60">
        {jobs.map((job) => {
          const bankId = bankFromExtractor(job.extractorId);
          const accent = BANK_ACCENTS[bankId];
          const checked = selectedIds.has(job.jobId);
          return (
            <li key={job.jobId}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-accent/50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    toggle(job.jobId);
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
                  <BankMark bankId={bankId} className="h-4 w-auto max-w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {accent.name} — {formatProcessedAt(job.createdAt)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatCount(job.movementCount)} movimientos
                    {job.warningCount > 0 ? ` · ${formatCount(job.warningCount)} advertencias` : ''}
                  </span>
                </span>
                <StatusBadge status={job.status} />
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
