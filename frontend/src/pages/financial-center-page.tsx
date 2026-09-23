import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConsolidatingLoader } from '@/features/financial-center/consolidating-loader';
import { FinancialCenter } from '@/features/financial-center/financial-center';
import { useFinancialStatements } from '@/features/financial-center/queries';
import { StatementSelector } from '@/features/financial-center/statement-selector';
import { useJobHistory } from '@/features/statements/queries';
import { describeError } from '@/lib/api-error';
import { formatCount } from '@/lib/format';
import type { JobListItem } from '@/types/job';

/**
 * Un documento entra al Centro Financiero solo si dejó archivos publicados: de
 * ahí salen sus movimientos. Un trabajo fallido, o uno todavía en proceso, no
 * tiene nada que consolidar.
 */
function isConsolidable(job: JobListItem): boolean {
  return (job.status === 'SUCCEEDED' || job.status === 'NEEDS_REVIEW') && job.artifactCount > 0;
}

function EmptyState(): ReactNode {
  return (
    <Card className="mx-auto w-full max-w-2xl items-center gap-3 rounded-2xl py-12 text-center">
      <p className="text-base font-semibold text-foreground">
        Todavía no tienes documentos que consolidar
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        El Centro Financiero cruza los estados de cuenta que ya procesaste. Sube uno y aparecerá
        aquí en cuanto termine.
      </p>
      <Button asChild>
        <Link to="/">Subir un estado de cuenta</Link>
      </Button>
    </Card>
  );
}

export function FinancialCenterPage(): ReactNode {
  const history = useJobHistory();
  // `null` mientras nadie ha confirmado la preselección.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string> | null>(null);

  const consolidables = useMemo(
    () => (history.data?.items ?? []).filter(isConsolidable),
    [history.data],
  );
  const chosen = useMemo(
    () => (selectedIds ? consolidables.filter((job) => selectedIds.has(job.jobId)) : []),
    [consolidables, selectedIds],
  );

  const { statements, isPending, failedJobIds } = useFinancialStatements(chosen);

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
        {selectedIds === null ? null : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSelectedIds(null);
            }}
          >
            Elegir otros documentos
          </Button>
        )}
      </div>

      {history.isError ? (
        <Alert variant="destructive" title={describeError(history.error)} />
      ) : history.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando el historial…</p>
      ) : consolidables.length === 0 ? (
        <EmptyState />
      ) : selectedIds === null ? (
        <StatementSelector
          jobs={consolidables}
          onConfirm={(ids) => {
            setSelectedIds(ids);
          }}
        />
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
