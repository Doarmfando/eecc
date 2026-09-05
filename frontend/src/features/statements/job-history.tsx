import { FileClock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { StatusBadge } from '@/components/shared/status-badge';
import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { describeError } from '@/lib/api-error';
import { formatCount } from '@/lib/format';
import type { JobListItem } from '@/types/job';

import { formatProcessedAt } from './format-processed-at';
import { useJobHistory } from './queries';

function HistoryRow({ job }: { job: JobListItem }): ReactNode {
  return (
    <li>
      <Link
        to={`/jobs/${job.jobId}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-2 py-3 hover:bg-accent"
      >
        <StatusBadge status={job.status} />
        <span className="flex-1 text-sm">{formatProcessedAt(job.createdAt)}</span>
        <span className="text-xs text-muted-foreground">
          {formatCount(job.movementCount)} movimientos · {formatCount(job.artifactCount)} archivos
          {job.warningCount > 0 ? ` · ${formatCount(job.warningCount)} advertencias` : ''}
        </span>
      </Link>
    </li>
  );
}

export function JobHistory(): ReactNode {
  const history = useJobHistory();

  if (history.isError) {
    return <Alert variant="destructive" title={describeError(history.error)} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileClock aria-hidden className="size-5 text-muted-foreground" />
          Documentos procesados
        </CardTitle>
        <CardDescription>
          Solo los de tu organización. Abre uno para revisar sus advertencias o descargar sus
          archivos.
        </CardDescription>
      </CardHeader>

      {history.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando el historial…</p>
      ) : history.data.items.length > 0 ? (
        <>
          <ul className="divide-y divide-border">
            {history.data.items.map((job) => (
              <HistoryRow key={job.jobId} job={job} />
            ))}
          </ul>
          {history.data.nextCursor === null ? null : (
            <p className="text-xs text-muted-foreground">
              Se muestran los más recientes; hay documentos más antiguos.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Todavía no has procesado ningún documento con esta credencial.
        </p>
      )}
    </Card>
  );
}
