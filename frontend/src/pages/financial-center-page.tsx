import type { ReactNode } from 'react';

import { FinancialCenter } from '@/features/financial-center/financial-center';

export function FinancialCenterPage(): ReactNode {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Centro Financiero</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flujo neto consolidado de tus estados de cuenta, por banco y por movimiento.
        </p>
      </div>

      <FinancialCenter />
    </div>
  );
}
