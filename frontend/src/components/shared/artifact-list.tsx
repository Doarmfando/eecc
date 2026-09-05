import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { useDownloadArtifact } from '@/features/statements/queries';
import { describeError } from '@/lib/api-error';
import { formatBytes } from '@/lib/format';
import { saveBlob } from '@/lib/save-file';
import type { Artifact } from '@/types/job';

import { describeArtifact } from './artifact-label';

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

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border">
        {artifacts.map((artifact) => {
          const Icon = artifact.kind === 'RESULT_XLSX' ? FileSpreadsheet : FileText;
          const label = describeArtifact(artifact.kind, artifact.name);
          const isDownloading = download.isPending && download.variables.artifactId === artifact.id;
          return (
            <li key={artifact.id} className="flex items-center gap-3 py-3">
              <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(artifact.byteSize)}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
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
                {isDownloading ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <Download aria-hidden />
                )}
                <span className="sr-only">Descargar {label}</span>
                <span aria-hidden>Descargar</span>
              </Button>
            </li>
          );
        })}
      </ul>

      {download.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {describeError(download.error)}
        </p>
      ) : null}
    </div>
  );
}
