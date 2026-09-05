import type { ReactNode } from 'react';

import { ArtifactList } from '@/components/shared/artifact-list';
import { StatusBadge } from '@/components/shared/status-badge';
import { CheckList, WarningList } from '@/components/shared/warning-list';
import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { formatCount } from '@/lib/format';
import { requiresReview, type Job } from '@/types/job';

function Metric({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

export function JobSummary({ job }: { job: Job }): ReactNode {
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Resultado del procesamiento</CardTitle>
            <CardDescription>
              Extractor {job.extractorId} versión {job.extractorVersion} · intento{' '}
              {formatCount(job.attemptNumber)}
            </CardDescription>
          </div>
          <StatusBadge status={job.status} />
        </div>

        {job.status === 'NEEDS_REVIEW' ? (
          <Alert
            variant="warning"
            title="Hay salida utilizable, pero con discrepancias"
            className="mt-4"
          >
            El archivo se generó y las cifras no reconcilian por completo. Revisa las invariantes
            antes de usar el resultado como definitivo.
          </Alert>
        ) : null}

        {job.status === 'FAILED' ? (
          <Alert
            variant="destructive"
            title="La extracción no produjo un resultado utilizable"
            className="mt-4"
          >
            No se publicó ningún archivo. Revisa las invariantes para conocer la causa.
          </Alert>
        ) : null}

        {job.reused ? (
          <p className="mt-4 text-sm text-slate-600">
            Este documento ya se había procesado con las mismas opciones; se reutilizó el resultado
            anterior.
          </p>
        ) : null}

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Páginas" value={formatCount(job.pageCount)} />
          <Metric label="Filas" value={formatCount(job.rowCount)} />
          <Metric label="Movimientos" value={formatCount(job.movementCount)} />
          <Metric label="Advertencias" value={formatCount(job.warningCodes.length)} />
        </dl>
      </Card>

      {requiresReview(job) ? (
        <Card>
          <CardTitle>Advertencias</CardTitle>
          <CardDescription>
            Cada código indica qué revisó el extractor y qué no pudo confirmar.
          </CardDescription>
          <div className="mt-4">
            <WarningList codes={job.warningCodes} />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardTitle>Invariantes verificadas</CardTitle>
        <CardDescription>Una extracción no es correcta solo porque produjo filas.</CardDescription>
        <div className="mt-4">
          <CheckList checks={job.checks} />
        </div>
      </Card>

      <Card>
        <CardTitle>Archivos publicados</CardTitle>
        <CardDescription>
          La descarga se autoriza con tu credencial y el archivo llega desde el procesador.
        </CardDescription>
        <div className="mt-4">
          <ArtifactList jobId={job.jobId} artifacts={job.artifacts} />
        </div>
      </Card>
    </div>
  );
}
