import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/app-config';

export type EphemeralArtifactKind = 'RESULT_XLSX' | 'RESULT_CSV';

export interface EphemeralArtifact {
  id: string;
  kind: EphemeralArtifactKind;
  /** Nombre generado por el worker; nunca el del documento que subió la persona. */
  name: string;
  byteSize: number;
  content: Buffer;
}

export interface EphemeralCheck {
  code: string;
  status: string;
}

export interface EphemeralJob {
  jobId: string;
  statementId: string;
  organizationId: string;
  idempotencyKey: string;
  status: string;
  createdAt: Date;
  attemptNumber: number;
  extractorId: string;
  extractorVersion: string;
  rowCount: number;
  movementCount: number;
  pageCount: number;
  warningCodes: string[];
  checks: EphemeralCheck[];
  artifacts: EphemeralArtifact[];
}

/**
 * Historial de trabajos que vive solo en el proceso.
 *
 * Sustituye a PostgreSQL y al almacenamiento de objetos cuando
 * `PERSISTENCE_MODE=memory`: los resultados se guardan como bytes en memoria y
 * desaparecen al reiniciar, al expirar o al desbordar el cupo. No hay un PDF de
 * origen: en este modo el documento nunca se conserva después de procesarlo.
 *
 * El cupo no es un detalle de rendimiento sino el límite que impide que un
 * proceso largo acumule estados de cuenta enteros en RAM.
 */
@Injectable()
export class EphemeralJobStore {
  private readonly logger = new Logger(EphemeralJobStore.name);
  private readonly jobs = new Map<string, EphemeralJob>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /** Guarda el trabajo y descarta lo caducado y lo que exceda el cupo. */
  save(job: EphemeralJob): EphemeralJob {
    this.jobs.set(this.key(job.organizationId, job.jobId), job);
    this.prune();
    return job;
  }

  find(organizationId: string, jobId: string): EphemeralJob | null {
    this.prune();
    return this.jobs.get(this.key(organizationId, jobId)) ?? null;
  }

  findByIdempotencyKey(organizationId: string, idempotencyKey: string): EphemeralJob | null {
    this.prune();
    for (const job of this.jobs.values()) {
      if (job.organizationId === organizationId && job.idempotencyKey === idempotencyKey) {
        return job;
      }
    }
    return null;
  }

  /** Del más reciente al más antiguo, igual que el historial en base de datos. */
  listNewestFirst(organizationId: string): EphemeralJob[] {
    this.prune();
    return [...this.jobs.values()]
      .filter((job) => job.organizationId === organizationId)
      .sort((left, right) => {
        const byDate = right.createdAt.getTime() - left.createdAt.getTime();
        return byDate !== 0 ? byDate : right.jobId.localeCompare(left.jobId);
      });
  }

  findArtifact(
    organizationId: string,
    jobId: string,
    artifactId: string,
  ): EphemeralArtifact | null {
    const job = this.find(organizationId, jobId);
    return job?.artifacts.find((artifact) => artifact.id === artifactId) ?? null;
  }

  private key(organizationId: string, jobId: string): string {
    return `${organizationId}/${jobId}`;
  }

  private prune(): void {
    const ttlMinutes = this.config.get('EPHEMERAL_TTL_MINUTES', { infer: true });
    const maxJobs = this.config.get('EPHEMERAL_MAX_JOBS', { infer: true });
    const oldestAllowed = Date.now() - ttlMinutes * 60_000;

    let discarded = 0;
    for (const [key, job] of this.jobs) {
      if (job.createdAt.getTime() < oldestAllowed) {
        this.jobs.delete(key);
        discarded += 1;
      }
    }

    // `Map` conserva el orden de inserción, así que las claves más antiguas van
    // primero y salen primero cuando el cupo se desborda.
    while (this.jobs.size > maxJobs) {
      const oldest = this.jobs.keys().next();
      if (oldest.done) {
        break;
      }
      this.jobs.delete(oldest.value);
      discarded += 1;
    }

    if (discarded > 0) {
      this.logger.log(`Trabajos descartados de memoria: ${String(discarded)}`);
    }
  }
}
