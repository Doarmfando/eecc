import { ArrowLeft, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useApiConfig } from '@/app/use-api-config';
import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { JobSummary } from '@/features/statements/job-summary';
import { useJob } from '@/features/statements/queries';
import { describeError } from '@/lib/api-error';
import { isTerminal } from '@/types/job';

export function JobPage(): ReactNode {
  const { jobId } = useParams<{ jobId: string }>();
  const { apiKey } = useApiConfig();
  const query = useJob(jobId);

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Volver a cargar otro documento
      </Link>

      {apiKey.length === 0 ? (
        <Alert variant="warning" title="Necesitas una credencial para consultar este trabajo">
          Vuelve al inicio y escribe la credencial de tu organización.
        </Alert>
      ) : null}

      {query.isPending && apiKey.length > 0 ? (
        <Card>
          <div className="flex items-center gap-3">
            <Loader2 aria-hidden className="size-5 animate-spin text-slate-500" />
            <div>
              <CardTitle>Consultando el trabajo</CardTitle>
              <CardDescription>Identificador {jobId}</CardDescription>
            </div>
          </div>
        </Card>
      ) : null}

      {query.isError ? (
        <Alert variant="destructive" title={describeError(query.error)}>
          {query.error.requestId ? (
            <p className="font-mono text-xs">Referencia: {query.error.requestId}</p>
          ) : null}
        </Alert>
      ) : null}

      {query.data ? (
        <>
          {!isTerminal(query.data.status) ? (
            <Alert variant="default" title="El trabajo sigue en curso">
              La página se actualiza sola y deja de consultar cuando el estado sea definitivo.
            </Alert>
          ) : null}
          <JobSummary job={query.data} />
        </>
      ) : null}
    </div>
  );
}
