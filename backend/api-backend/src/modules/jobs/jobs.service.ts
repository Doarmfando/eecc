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
   * Historial de la organización, del más reciente al más antiguo.
   * Pide un elemento extra para saber si hay página siguiente sin contar el total.
   */
  async list(
    organizationId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<JobListDto> {
    const limit = Math.min(options.limit ?? JOB_LIST_DEFAULT_LIMIT, JOB_LIST_MAX_LIMIT);
    const where: Prisma.JobWhereInput = { organizationId };

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
      items: page.map(toListItem),
      nextCursor:
        rows.length > limit && last
          ? encodeJobCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  /** Toda consulta de un tenant exige su organización; no existe `findById(id)` a secas. */
  async findOne(organizationId: string, jobId: string): Promise<JobResponseDto> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, organizationId },
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
  attempts: {
    extractorId: string | null;
    movementCount: number | null;
    _count: { warnings: number; artifacts: number };
  }[];
}

function toListItem(job: JobRow): JobListItemDto {
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
  };
}
