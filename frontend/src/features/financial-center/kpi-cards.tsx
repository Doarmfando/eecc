import { ListChecks, Scale, ShieldCheck, Wallet } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { formatCount, formatSoles } from '@/lib/format';

import type { FinancialKpis } from './use-financial-center';

function KpiCard({
  label,
  value,
  subtitle,
  Icon,
}: {
  label: string;
  value: string;
  subtitle: string;
  Icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
}): ReactNode {
  return (
    <Card className="gap-3 p-5 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon aria-hidden className="size-5" />
        </span>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <div>
        <p className="text-2xl leading-tight font-semibold tracking-tight text-foreground">
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </Card>
  );
}

export function KpiCards({ kpis }: { kpis: FinancialKpis }): ReactNode {
  const precisionPercent = (kpis.precisionRate * 100).toFixed(1);
  const discrepancies = kpis.movementCount - kpis.reconciledCount;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Flujo total procesado"
        value={formatSoles(kpis.totalFlowCents)}
        subtitle={`${formatCount(kpis.movementCount)} movimientos en el periodo`}
        Icon={Wallet}
      />
      <KpiCard
        label="Movimientos reconciliados"
        value={formatCount(kpis.reconciledCount)}
        subtitle={`de ${formatCount(kpis.movementCount)} filas totales`}
        Icon={ListChecks}
      />
      <KpiCard
        label="Saldo global consolidado"
        value={formatSoles(kpis.netBalanceCents)}
        subtitle={
          kpis.isBalanced
            ? 'Cuadrado con las invariantes verificadas'
            : `${formatCount(discrepancies)} movimiento(s) con discrepancia`
        }
        Icon={Scale}
      />
      <KpiCard
        label="Tasa de precisión"
        value={`${precisionPercent}%`}
        subtitle={
          kpis.isBalanced
            ? 'Verificado sin discrepancias'
            : 'Reconciliación sobre el total filtrado'
        }
        Icon={ShieldCheck}
      />
    </div>
  );
}
