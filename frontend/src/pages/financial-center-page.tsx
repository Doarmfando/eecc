import type { ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { ConsolidatingLoader } from '@/features/financial-center/consolidating-loader';
import { FinancialCenter } from '@/features/financial-center/financial-center';
import {
  ChooseInHistoryLink,
  NoStatementsState,
} from '@/features/financial-center/no-statements-state';
import { useSelectedStatements } from '@/features/financial-center/queries';
import { describeError } from '@/lib/api-error';
import { formatCount } from '@/lib/format';

/**
 * Consolida directamente los documentos marcados en el Historial: la selección
 * se hace allí, una sola vez, y la comparte el Calendario.
 */
export function FinancialCenterPage(): ReactNode {
  const { history, consolidables, chosen, statements, isPending, failedJobIds } =
    useSelectedStatements();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Centro Financiero
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Flujo neto consolidado de tus estados de cuenta, por banco y por movimiento.
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
              consolidado. Lo que ves abajo no los incluye.
            </Alert>
          ) : null}
          <FinancialCenter statements={statements} />
        </>
      )}
    </div>
  );
}
