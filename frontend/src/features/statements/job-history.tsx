import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { StatusBadge } from '@/components/shared/status-badge';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { describeError } from '@/lib/api-error';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { JobListItem } from '@/types/job';

import { formatProcessedAt } from './format-processed-at';
import { useJobHistory } from './queries';
import { RetentionNotice } from './retention-notice';
import {
  isConsolidable,
  useStatementSelection,
  type StatementSelection,
} from './statement-selection';

function HistoryRow({
  job,
  selection,
}: {
  job: JobListItem;
  selection: StatementSelection;
}): ReactNode {
  const consolidable = isConsolidable(job);
  const included = consolidable && selection.isIncluded(job.jobId);
  return (
    <li className="flex items-center gap-2">
      <Link
        to={`/jobs/${job.jobId}`}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-2 py-3 hover:bg-accent"
      >
        <StatusBadge status={job.status} />
        <span className="flex-1 text-sm">{formatProcessedAt(job.createdAt)}</span>
        <span className="text-xs text-muted-foreground">
          {formatCount(job.movementCount)} movimientos · {formatCount(job.artifactCount)} archivos
          {job.warningCount > 0 ? ` · ${formatCount(job.warningCount)} advertencias` : ''}
        </span>
      </Link>
      {/* Fuera del enlace: marcar no debe abrir el documento. Uno sin archivos
          publicados no tiene movimientos que analizar, así que no se ofrece. */}
      <span className="flex w-10 shrink-0 justify-center">
        {consolidable ? (
          <input
            type="checkbox"
            checked={included}
            aria-label={`Incluir el documento del ${formatProcessedAt(job.createdAt)} en el análisis`}
            title="Incluir en el Centro Financiero y el Calendario"
            onChange={(event) => {
              selection.setIncluded(job.jobId, event.target.checked);
            }}
            className={cn(
              'size-4 cursor-pointer rounded border-border text-primary',
              'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
            )}
          />
        ) : null}
      </span>
    </li>
  );
}

export function JobHistory(): ReactNode {
  const history = useJobHistory();
  const selection = useStatementSelection();
  const hasConsolidable = history.data?.items.some(isConsolidable) ?? false;

  if (history.isError) {
    return <Alert variant="destructive" title={describeError(history.error)} />;
  }

  return (
    <Card>
      <RetentionNotice />

      {history.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando el historial…</p>
      ) : history.data.items.length > 0 ? (
        <>
          {hasConsolidable ? (
            <p className="text-xs text-muted-foreground">
              Marca los documentos que quieres ver en el Centro Financiero y el Calendario.
            </p>
          ) : null}
          <ul className="divide-y divide-border">
            {history.data.items.map((job) => (
              <HistoryRow key={job.jobId} job={job} selection={selection} />
            ))}
          </ul>
          {history.data.nextCursor === null ? null : (
            <p className="text-xs text-muted-foreground">
              Se muestran los más recientes; hay documentos más antiguos.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no has procesado ningún documento.</p>
      )}
    </Card>
  );
}
