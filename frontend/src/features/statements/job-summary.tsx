import { Download, FileStack, Layers, ListChecks, Loader2, TriangleAlert } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import excelIcon from '@/assets/files/excel.svg';
import { ArtifactList } from '@/components/shared/artifact-list';
import { describeArtifact } from '@/components/shared/artifact-label';
import { StatusBadge } from '@/components/shared/status-badge';
import { CheckList, WarningList } from '@/components/shared/warning-list';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDownloadArtifact } from '@/features/statements/queries';
import { formatBytes, formatCount } from '@/lib/format';
import { saveBlob } from '@/lib/save-file';
import { cn } from '@/lib/utils';
import { requiresReview, type Artifact, type Job } from '@/types/job';

type StatTone = 'blue' | 'indigo' | 'emerald' | 'amber';

const STAT_TONE_CLASSES: Record<StatTone, string> = {
  blue: 'bg-blue-50 text-blue-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
};

function StatItem({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  Icon: ComponentType<{ 'aria-hidden'?: boolean; className?: string }>;
  tone: StatTone;
}): ReactNode {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          STAT_TONE_CLASSES[tone],
        )}
      >
        <Icon aria-hidden className="size-4" />
      </span>
      <div>
        <dt className="text-[11px] leading-none text-muted-foreground">{label}</dt>
        <dd className="mt-1 text-sm leading-none font-semibold text-foreground">{value}</dd>
      </div>
    </div>
  );
}

function PrimaryDownloadButton({
  jobId,
  artifact,
}: {
  jobId: string;
  artifact: Artifact;
}): ReactNode {
  const download = useDownloadArtifact();
  const label = describeArtifact(artifact.kind, artifact.name);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-blue-200/70 bg-blue-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <img src={excelIcon} alt="" aria-hidden className="size-10 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(artifact.byteSize)}</p>
        </div>
      </div>
      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto"
        disabled={download.isPending}
        onClick={() => {
          download.mutate(
            { jobId, artifactId: artifact.id },
            {
              onSuccess: (result) => {
                saveBlob(result.blob, result.fileName);
              },
            },
          );
        }}
      >
        {download.isPending ? (
          <Loader2 aria-hidden className="animate-spin" />
        ) : (
          <Download aria-hidden />
        )}
        Descargar Excel (.xlsx)
      </Button>
    </div>
  );
}

export function JobSummary({ job }: { job: Job }): ReactNode {
  const primaryArtifact = job.artifacts.find((artifact) => artifact.kind === 'RESULT_XLSX');
  const supportingArtifacts = job.artifacts.filter((artifact) => artifact.kind !== 'RESULT_XLSX');

  return (
    <div className="space-y-6">
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

        <div className="border-t border-slate-200 pt-4">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatItem label="Páginas" value={formatCount(job.pageCount)} Icon={FileStack} tone="blue" />
            <StatItem label="Filas" value={formatCount(job.rowCount)} Icon={Layers} tone="indigo" />
            <StatItem
              label="Movimientos"
              value={formatCount(job.movementCount)}
              Icon={ListChecks}
              tone="emerald"
            />
            <StatItem
              label="Advertencias"
              value={formatCount(job.warningCodes.length)}
              Icon={TriangleAlert}
              tone="amber"
            />
          </dl>
        </div>

        {primaryArtifact ? (
          <PrimaryDownloadButton jobId={job.jobId} artifact={primaryArtifact} />
        ) : null}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
          {supportingArtifacts.length > 0 ? (
            <ArtifactList jobId={job.jobId} artifacts={supportingArtifacts} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {primaryArtifact
                ? 'El Excel consolidado se descarga arriba. Este trabajo no publicó archivos adicionales.'
                : 'Este trabajo no publicó archivos. Revisa las invariantes para saber por qué.'}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
