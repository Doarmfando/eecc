import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ArtifactKind } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { WorkerClientService } from '../worker-client/worker-client.service';

export interface DownloadableArtifact {
  content: Buffer;
  contentType: string;
  fileName: string;
}

const CONTENT_TYPES: Record<ArtifactKind, string> = {
  SOURCE_PDF: 'application/pdf',
  RESULT_XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  RESULT_CSV: 'text/csv; charset=utf-8',
  TECHNICAL_MANIFEST: 'application/json',
};

const EXTENSIONS: Record<ArtifactKind, string> = {
  SOURCE_PDF: 'pdf',
  RESULT_XLSX: 'xlsx',
  RESULT_CSV: 'csv',
  TECHNICAL_MANIFEST: 'json',
};

/** `worker/<organización>/<trabajoDelWorker>/<nombre>`: clave opaca, no una ruta del sistema. */
const WORKER_KEY = /^worker\/[0-9a-f-]{36}\/([0-9a-f]{32})\/([A-Za-z0-9._-]{1,120})$/;

@Injectable()
export class ArtifactDownloadService {
  private readonly logger = new Logger(ArtifactDownloadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly worker: WorkerClientService,
  ) {}

  /**
   * Resuelve el contenido de un artefacto que pertenece al trabajo y a la organización
   * indicados. El nombre entregado al cliente se deriva del tipo, nunca del documento
   * original ni de la clave de objeto.
   */
  async download(
    organizationId: string,
    jobId: string,
    artifactId: string,
  ): Promise<DownloadableArtifact> {
    const artifact = await this.prisma.artifact.findFirst({
      where: {
        id: artifactId,
        organizationId,
        jobAttempt: { jobId, organizationId },
      },
      select: { kind: true, objectKey: true },
    });

    if (!artifact) {
      throw new NotFoundException({ code: 'ARTIFACT_NOT_FOUND' });
    }

    const content = await this.readContent(artifact.objectKey);
    return {
      content,
      contentType: CONTENT_TYPES[artifact.kind],
      fileName: `${jobId}.${EXTENSIONS[artifact.kind]}`,
    };
  }

  private async readContent(objectKey: string): Promise<Buffer> {
    const workerMatch = WORKER_KEY.exec(objectKey);
    if (workerMatch) {
      const [, workerJobId, name] = workerMatch;
      if (!workerJobId || !name) {
        throw new NotFoundException({ code: 'ARTIFACT_NOT_FOUND' });
      }
      return this.worker.fetchArtifact(workerJobId, name);
    }

    try {
      return await this.storage.get(objectKey);
    } catch (error) {
      // Un objeto ausente o una clave de una versión anterior no es un fallo del
      // servidor: para el cliente el artefacto sencillamente no está disponible.
      this.logger.warn(
        `El objeto de un artefacto no pudo leerse: ${error instanceof Error ? error.name : 'desconocido'}`,
      );
      throw new NotFoundException({ code: 'ARTIFACT_NOT_FOUND' });
    }
  }
}
