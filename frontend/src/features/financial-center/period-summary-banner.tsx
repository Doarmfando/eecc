import type { ReactNode } from 'react';

import { formatSoles } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { PeriodSummary } from './use-financial-center';

function Term({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'destructive';
}): ReactNode {
  return (
    <div className="flex flex-col items-center gap-0.5 text-center">
      <span
        className={cn(
          'text-base font-bold sm:text-lg',
          tone === 'success'
            ? 'text-success'
            : tone === 'destructive'
              ? 'text-destructive'
              : 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}

function Operator({ symbol }: { symbol: string }): ReactNode {
  return (
    <span aria-hidden className="text-lg font-semibold text-muted-foreground/60">
      {symbol}
    </span>
  );
}

/**
 * La ecuación del EECC, visible: quien no maneja jerga contable igual entiende
 * de dónde sale el saldo final con solo mirar los cuatro números en fila.
 */
export function PeriodSummaryBanner({ summary }: { summary: PeriodSummary }): ReactNode {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-muted/50 px-4 py-4 sm:gap-4">
      <Term label="Saldo inicial" value={formatSoles(summary.saldoInicial)} />
      <Operator symbol="+" />
      <Term label="Entradas" value={formatSoles(summary.abonos)} tone="success" />
      <Operator symbol="−" />
      <Term label="Salidas" value={formatSoles(summary.cargos)} tone="destructive" />
      <Operator symbol="=" />
      <Term label="Saldo final" value={formatSoles(summary.saldoFinal)} />
    </div>
  );
}
