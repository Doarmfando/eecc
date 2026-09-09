import { FileStack, Layers, ListChecks, TriangleAlert } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { ArtifactList } from '@/components/shared/artifact-list';
import { StatusBadge } from '@/components/shared/status-badge';
import { CheckList, WarningList } from '@/components/shared/warning-list';
import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCount } from '@/lib/format';
import { requiresReview, type Job } from '@/types/job';

function Metric({
  label,
  value,
  Icon,
}: {
  label: string;
  value: string;
  Icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
}): ReactNode {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/40 p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon aria-hidden className="size-[18px]" />
      </span>
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-xl leading-tight font-semibold text-foreground">{value}</dd>
      </div>
    </div>
  );
}

export function JobSummary({ job }: { job: Job }): ReactNode {
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardHeader>
            <CardTitle>Resultado del procesamiento</CardTitle>
            <CardDescription>
              Extractor {job.extractorId} versión {job.extractorVersion} · intento{' '}
              {formatCount(job.attemptNumber)}
            </CardDescription>
          </CardHeader>
          <StatusBadge status={job.status} />
        </div>

        {job.status === 'NEEDS_REVIEW' ? (
          <Alert
            variant="warning"
            title="Hay salida utilizable, pero con discrepancias"
            className="mt-1"
          >
            El archivo se generó y las cifras no reconcilian por completo. Revisa las invariantes
            antes de usar el resultado como definitivo.
          </Alert>
        ) : null}

        {job.status === 'FAILED' ? (
          <Alert
            variant="destructive"
            title="La extracción no produjo un resultado utilizable"
            className="mt-1"
          >
            No se publicó ningún archivo. Revisa las invariantes para conocer la causa.
          </Alert>
        ) : null}

        {job.reused ? (
          <p className="-mt-1 text-sm text-muted-foreground">
            Este documento ya se había procesado con las mismas opciones; se reutilizó el resultado
            anterior.
          </p>
        ) : null}

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Páginas" value={formatCount(job.pageCount)} Icon={FileStack} />
          <Metric label="Filas" value={formatCount(job.rowCount)} Icon={Layers} />
          <Metric label="Movimientos" value={formatCount(job.movementCount)} Icon={ListChecks} />
          <Metric
            label="Advertencias"
            value={formatCount(job.warningCodes.length)}
            Icon={TriangleAlert}
          />
        </dl>
      </Card>

      {requiresReview(job) ? (
        <Card>
          <CardHeader>
            <CardTitle>Advertencias</CardTitle>
            <CardDescription>
              Cada código indica qué revisó el extractor y qué no pudo confirmar.
            </CardDescription>
          </CardHeader>
          <WarningList codes={job.warningCodes} />
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Invariantes verificadas</CardTitle>
          <CardDescription>
            Una extracción no es correcta solo porque produjo filas.
          </CardDescription>
        </CardHeader>
        <CheckList checks={job.checks} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Archivos publicados</CardTitle>
          <CardDescription>
            La descarga se autoriza con tu credencial y el archivo llega desde el procesador.
          </CardDescription>
        </CardHeader>
        <ArtifactList jobId={job.jobId} artifacts={job.artifacts} />
      </Card>
    </div>
  );
}
