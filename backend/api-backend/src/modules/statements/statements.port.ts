import type { JobResponseDto } from './dto/create-statement.dto';
import type { DownloadableArtifact } from './artifact-download.service';
import type { ProcessStatementCommand } from './statements.service';
import type { JobListDto } from '../jobs/dto/job-list.dto';

/**
 * Los controladores hablan con estos puertos, no con una implementación.
 *
 * Existen dos juegos de implementaciones y `PERSISTENCE_MODE` decide cuál se
 * inyecta: la que persiste en PostgreSQL y disco, y la que no guarda nada fuera
 * del proceso. El contrato HTTP es idéntico en ambos casos.
 */

export interface StatementProcessor {
  process(command: ProcessStatementCommand): Promise<JobResponseDto>;
}

export interface JobReader {
  list(organizationId: string, options?: { limit?: number; cursor?: string }): Promise<JobListDto>;
  findOne(organizationId: string, jobId: string): Promise<JobResponseDto>;
}

export interface ArtifactDownloader {
  download(
    organizationId: string,
    jobId: string,
    artifactId: string,
  ): Promise<DownloadableArtifact>;
}

export const STATEMENT_PROCESSOR = Symbol('STATEMENT_PROCESSOR');
export const JOB_READER = Symbol('JOB_READER');
export const ARTIFACT_DOWNLOADER = Symbol('ARTIFACT_DOWNLOADER');
