import type { ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { FinancialCalendarView } from '@/features/financial-calendar/financial-calendar-view';
import { ConsolidatingLoader } from '@/features/financial-center/consolidating-loader';
import {
  ChooseInHistoryLink,
  NoStatementsState,
} from '@/features/financial-center/no-statements-state';
import { useSelectedStatements } from '@/features/financial-center/queries';
import { describeError } from '@/lib/api-error';
import { formatCount } from '@/lib/format';

/** Los mismos documentos que el Centro Financiero: los marcados en el Historial. */
export function FinancialCalendarPage(): ReactNode {
  const { history, consolidables, chosen, statements, isPending, failedJobIds } =
    useSelectedStatements();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendario</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Control diario del flujo de tus estados de cuenta: elige un mes, un banco y un día para
            ver el detalle.
          </p>
        </div>
        {consolidables.length > 0 ? <ChooseInHistoryLink /> : null}
      </div>

      {history.isError ? (
        <Alert variant="destructive" title={describeError(history.error)} />
      ) : history.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando el historial…</p>
      ) : consolidables.length === 0 ? (
        <NoStatementsState reason="sin-documentos" />
      ) : chosen.length === 0 ? (
        <NoStatementsState reason="ninguno-marcado" />
      ) : isPending ? (
        <ConsolidatingLoader />
      ) : (
        <>
          {failedJobIds.length > 0 ? (
            <Alert variant="warning" title="No se pudieron leer todos los documentos">
              {formatCount(failedJobIds.length)} de {formatCount(chosen.length)} quedaron fuera del
              calendario. Lo que ves abajo no los incluye.
            </Alert>
          ) : null}
          {/* La clave reinicia mes y filtros cuando cambia la selección del Historial. */}
          <FinancialCalendarView
            key={chosen.map((job) => job.jobId).join(',')}
            statements={statements}
          />
        </>
      )}
    </div>
  );
}
