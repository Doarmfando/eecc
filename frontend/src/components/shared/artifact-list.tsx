import { Download, FileText, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

import pdfIcon from '@/assets/files/pdf.svg';
import { Button } from '@/components/ui/button';
import { useDownloadArtifact } from '@/features/statements/queries';
import { describeError } from '@/lib/api-error';
import { formatBytes } from '@/lib/format';
import { saveBlob } from '@/lib/save-file';
import type { Artifact } from '@/types/job';

import { describeArtifact } from './artifact-label';

interface DownloadHandlers {
  isPending: boolean;
  isDownloading(artifactId: string): boolean;
  download(artifact: Artifact): void;
}

function SecondaryArtifact({
  artifact,
  handlers,
}: {
  artifact: Artifact;
  handlers: DownloadHandlers;
}): ReactNode {
  const label = describeArtifact(artifact.kind, artifact.name);
  const isDownloading = handlers.isDownloading(artifact.id);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3.5 transition-colors hover:border-slate-300 hover:bg-slate-50">
      <img src={pdfIcon} alt="" aria-hidden className="size-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(artifact.byteSize)}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={handlers.isPending}
        onClick={() => {
          handlers.download(artifact);
        }}
      >
        {isDownloading ? (
          <Loader2 aria-hidden className="animate-spin" />
        ) : (
          <Download aria-hidden />
        )}
        <span className="sr-only">Descargar {label}</span>
        <span aria-hidden>Descargar</span>
      </Button>
    </div>
  );
}

function CompactArtifactRow({
  artifact,
  handlers,
}: {
  artifact: Artifact;
  handlers: DownloadHandlers;
}): ReactNode {
  const label = describeArtifact(artifact.kind, artifact.name);
  const isDownloading = handlers.isDownloading(artifact.id);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <FileText aria-hidden className="size-4 shrink-0 text-slate-400" />
        <span className="truncate text-sm text-slate-700">{label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatBytes(artifact.byteSize)}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={handlers.isPending}
        onClick={() => {
          handlers.download(artifact);
        }}
      >
        {isDownloading ? (
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
        ) : (
          <Download aria-hidden className="size-3.5" />
        )}
        <span className="sr-only">Descargar {label}</span>
        <span aria-hidden>Descargar</span>
      </Button>
    </div>
  );
}

export function ArtifactList({
  jobId,
  artifacts,
}: {
  jobId: string;
  artifacts: Artifact[];
}): ReactNode {
  const download = useDownloadArtifact();

  if (artifacts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este trabajo no publicó archivos. Revisa las invariantes para saber por qué.
      </p>
    );
  }

  const handlers: DownloadHandlers = {
    isPending: download.isPending,
    isDownloading: (artifactId) =>
      download.isPending && download.variables.artifactId === artifactId,
    download: (artifact) => {
      download.mutate(
        { jobId, artifactId: artifact.id },
        {
          onSuccess: (result) => {
            saveBlob(result.blob, result.fileName);
          },
        },
      );
    },
  };

  const source = artifacts.filter((artifact) => artifact.kind === 'SOURCE_PDF');
  const supporting = artifacts.filter((artifact) => artifact.kind !== 'SOURCE_PDF');

  return (
    <div className="space-y-4">
      {source.map((artifact) => (
        <SecondaryArtifact key={artifact.id} artifact={artifact} handlers={handlers} />
      ))}

      {supporting.length > 0 ? (
        <div>
          {source.length > 0 ? (
            <p className="mb-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Archivos de auditoría
            </p>
          ) : null}
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {supporting.map((artifact) => (
              <CompactArtifactRow key={artifact.id} artifact={artifact} handlers={handlers} />
            ))}
          </div>
        </div>
      ) : null}

      {download.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {describeError(download.error)}
        </p>
      ) : null}
    </div>
  );
}
