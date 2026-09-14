import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { toJobResponse } from '../statements/job-response.mapper';
import type { JobResponseDto } from '../statements/dto/create-statement.dto';
import {
  JOB_LIST_DEFAULT_LIMIT,
  JOB_LIST_MAX_LIMIT,
  type JobListDto,
  type JobListItemDto,
} from './dto/job-list.dto';
import { decodeJobCursor, encodeJobCursor } from './job-cursor';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Historial de quien consulta, del más reciente al más antiguo: cada persona ve
   * solo los documentos que subió, sea usuario o administrador. `viewerUserId`
   * nulo es una credencial de servicio y ve los subidos por credenciales de
   * servicio, el mismo grupo al que aplica el cupo.
   * Pide un elemento extra para saber si hay página siguiente sin contar el total.
   */
  async list(
    organizationId: string,
    viewerUserId: string | null,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<JobListDto> {
    const limit = Math.min(options.limit ?? JOB_LIST_DEFAULT_LIMIT, JOB_LIST_MAX_LIMIT);
    const where: Prisma.JobWhereInput = {
      organizationId,
      statement: { uploadedById: viewerUserId },
    };

    if (options.cursor !== undefined) {
      const cursor = decodeJobCursor(options.cursor);
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }

    const rows = await this.prisma.job.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        statement: { select: { uploadedById: true } },
        attempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          include: { _count: { select: { warnings: true, artifacts: true } } },
        },
      },
    });

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((job) => toListItem(job, viewerUserId)),
      nextCursor:
        rows.length > limit && last
          ? encodeJobCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  /**
   * Toda consulta exige organización y dueño; no existe `findById(id)` a secas.
   * El trabajo de otra persona responde 404, igual que uno que no existe: saber
   * su identificador no basta para verlo.
   */
  async findOne(
    organizationId: string,
    viewerUserId: string | null,
    jobId: string,
  ): Promise<JobResponseDto> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, organizationId, statement: { uploadedById: viewerUserId } },
      include: {
        attempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          include: { warnings: true, artifacts: true },
        },
      },
    });

    const attempt = job?.attempts[0];
    if (!job || !attempt) {
      throw new NotFoundException({ code: 'JOB_NOT_FOUND' });
    }

    return toJobResponse({
      jobId: job.id,
      statementId: job.statementId,
      status: job.status,
      attempt,
      reused: false,
    });
  }
}

interface JobRow {
  id: string;
  statementId: string;
  status: string;
  createdAt: Date;
  statement: { uploadedById: string | null };
  attempts: {
    extractorId: string | null;
    movementCount: number | null;
    _count: { warnings: number; artifacts: number };
  }[];
}

function toListItem(job: JobRow, viewerUserId: string | null): JobListItemDto {
  const attempt = job.attempts[0];
  return {
    jobId: job.id,
    statementId: job.statementId,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    extractorId: attempt?.extractorId ?? '',
    movementCount: attempt?.movementCount ?? 0,
    warningCount: attempt?._count.warnings ?? 0,
    artifactCount: attempt?._count.artifacts ?? 0,
    // Nulo contra nulo no cuenta: un documento subido por una credencial de
    // servicio no es «mío» aunque quien mire tampoco tenga usuario.
    uploadedByMe: viewerUserId !== null && job.statement.uploadedById === viewerUserId,
  };
}
