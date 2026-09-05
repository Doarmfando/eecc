import { Injectable, NotFoundException } from '@nestjs/common';

import type { JobResponseDto } from '../statements/dto/create-statement.dto';
import {
  JOB_LIST_DEFAULT_LIMIT,
  JOB_LIST_MAX_LIMIT,
  type JobListDto,
} from '../jobs/dto/job-list.dto';
import { decodeJobCursor, encodeJobCursor } from '../jobs/job-cursor';
import { EphemeralJobStore, type EphemeralJob } from './ephemeral-job.store';
import { toEphemeralJobResponse, toEphemeralListItem } from './ephemeral-job.mapper';

/**
 * Historial y consulta puntual sobre el almacén en memoria.
 *
 * Mantiene la paginación por clave del modo con base de datos, aunque aquí la
 * lista quepa entera: así el cliente no necesita saber en qué modo corre la API.
 */
@Injectable()
export class EphemeralJobsService {
  constructor(private readonly store: EphemeralJobStore) {}

  // Cumple el puerto asíncrono aunque en memoria no haya nada que esperar: así
  // un fallo llega siempre como promesa rechazada, igual que con base de datos.
  // eslint-disable-next-line @typescript-eslint/require-await
  async list(
    organizationId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<JobListDto> {
    const limit = Math.min(options.limit ?? JOB_LIST_DEFAULT_LIMIT, JOB_LIST_MAX_LIMIT);
    let rows = this.store.listNewestFirst(organizationId);

    if (options.cursor !== undefined) {
      const cursor = decodeJobCursor(options.cursor);
      rows = rows.filter((job) => isOlderThan(job, cursor.createdAt, cursor.id));
    }

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toEphemeralListItem),
      nextCursor:
        rows.length > limit && last
          ? encodeJobCursor({ createdAt: last.createdAt, id: last.jobId })
          : null,
    };
  }

  /** Toda consulta exige la organización, igual que con base de datos. */
  // eslint-disable-next-line @typescript-eslint/require-await
  async findOne(organizationId: string, jobId: string): Promise<JobResponseDto> {
    const job = this.store.find(organizationId, jobId);
    if (!job) {
      throw new NotFoundException({ code: 'JOB_NOT_FOUND' });
    }
    return toEphemeralJobResponse(job, false);
  }
}

/** Mismo desempate que en SQL: por fecha y, si empatan, por identificador. */
function isOlderThan(job: EphemeralJob, createdAt: Date, id: string): boolean {
  const difference = job.createdAt.getTime() - createdAt.getTime();
  if (difference !== 0) {
    return difference < 0;
  }
  return job.jobId < id;
}
