import type { ReactNode } from 'react';

import { FinancialCalendarView } from '@/features/financial-calendar/financial-calendar-view';

export function FinancialCalendarPage(): ReactNode {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendario</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control diario del flujo de tus estados de cuenta: elige un mes, un banco y un día para
          ver el detalle.
        </p>
      </div>

      <FinancialCalendarView />
    </div>
  );
}
