import { Injectable, NotFoundException } from '@nestjs/common';

import type { DownloadableArtifact } from '../statements/artifact-download.service';
import { EphemeralJobStore, type EphemeralArtifactKind } from './ephemeral-job.store';

const CONTENT_TYPES: Record<EphemeralArtifactKind, string> = {
  RESULT_XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  RESULT_CSV: 'text/csv; charset=utf-8',
};

const EXTENSIONS: Record<EphemeralArtifactKind, string> = {
  RESULT_XLSX: 'xlsx',
  RESULT_CSV: 'csv',
};

/**
 * Entrega un artefacto que solo existe en memoria.
 *
 * No hay lectura de disco ni petición al worker: los bytes se descargaron al
 * procesar y la copia del worker ya se descartó. Si el trabajo caducó o el
 * proceso se reinició, el artefacto sencillamente no está.
 */
@Injectable()
export class EphemeralArtifactDownloadService {
  constructor(private readonly store: EphemeralJobStore) {}

  // Cumple el puerto asíncrono aunque en memoria no haya nada que esperar: así
  // un fallo llega siempre como promesa rechazada, igual que con base de datos.
  // eslint-disable-next-line @typescript-eslint/require-await
  async download(
    organizationId: string,
    jobId: string,
    artifactId: string,
  ): Promise<DownloadableArtifact> {
    const artifact = this.store.findArtifact(organizationId, jobId, artifactId);
    if (!artifact) {
      throw new NotFoundException({ code: 'ARTIFACT_NOT_FOUND' });
    }

    return {
      content: artifact.content,
      contentType: CONTENT_TYPES[artifact.kind],
      // El nombre lo decide el servidor, nunca el documento original.
      fileName: `${jobId}.${EXTENSIONS[artifact.kind]}`,
    };
  }
}
