import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import {
  DeleteStatementsDialog,
  type DeleteTarget,
} from '@/features/statements/delete-statements-dialog';
import { JobSummary } from '@/features/statements/job-summary';
import { useJob } from '@/features/statements/queries';
import { pideRevision } from '@/features/statements/review-result';
import { ReviewResultDialog } from '@/features/statements/review-result-dialog';
import { describeError } from '@/lib/api-error';
import { isTerminal } from '@/types/job';

export function JobPage(): ReactNode {
  const { jobId } = useParams<{ jobId: string }>();
  const query = useJob(jobId);
  const navigate = useNavigate();
  const location = useLocation();
  const [aBorrar, setABorrar] = useState<DeleteTarget | null>(null);
  const [revisado, setRevisado] = useState(false);
  const documento = query.data;
  // Solo al llegar desde la carga: abrir el enlace o recargar no vuelve a preguntar.
  const recienConvertido = leerTrabajoRecibido(location.state) === jobId;
  const preguntar =
    recienConvertido && !revisado && documento !== undefined && pideRevision(documento);

  function terminarRevision(): void {
    setRevisado(true);
    // Sin el estado de la navegación, volver atrás o recargar no reabre el aviso.
    void navigate(location.pathname, { replace: true, state: null });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Volver a cargar otro documento
        </Link>
        {/* También para la Básica, que no tiene Historial: es aquí donde lo ve. */}
        {documento && isTerminal(documento.status) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setABorrar({
                statementId: documento.statementId,
                name: documento.sourceFileName ?? 'este documento',
              });
            }}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 aria-hidden />
            Borrar este documento
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
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

      {documento ? (
        <ReviewResultDialog
          job={documento}
          open={preguntar}
          onContinue={terminarRevision}
          onDiscarded={() => {
            setRevisado(true);
            // Ya no existe: quedarse aquí solo daría un error al refrescar.
            void navigate('/', { replace: true });
          }}
        />
      ) : null}

      <DeleteStatementsDialog
        target={aBorrar}
        onClose={() => {
          setABorrar(null);
        }}
        onDeleted={() => {
          // El documento ya no existe: quedarse aquí solo daría un error al refrescar.
          void navigate('/', { replace: true });
        }}
      />
    </div>
  );
}

/** El trabajo que la carga dejó en el estado de la navegación, si lo hay. */
function leerTrabajoRecibido(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('job' in state)) {
    return null;
  }
  const { job } = state;
  return typeof job === 'object' && job !== null && 'jobId' in job && typeof job.jobId === 'string'
    ? job.jobId
    : null;
}
