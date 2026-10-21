import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PLAN_CODE_PATTERN,
  ROLE_CODE_PATTERN,
  toPlanSummary,
  type PlanSummary,
} from './access-catalog';

export interface PlanOption extends PlanSummary {
  description: string;
  isDefault: boolean;
}

export interface RoleOption {
  code: string;
  name: string;
  description: string;
  rank: number;
  /** Plan que se propone al dar de alta con este rol. Nulo: hay que elegirlo. */
  defaultPlanCode: string | null;
  /** Si su membresía lleva fecha de vencimiento (ADR-0017). */
  planExpiryRequired: boolean;
  permissions: string[];
}

export interface RoleRef {
  code: string;
  rank: number;
  defaultPlanCode: string | null;
  planExpiryRequired: boolean;
}

const PLAN_SELECT = {
  code: true,
  name: true,
  description: true,
  maxRetainedStatements: true,
  maxPagesPerDocument: true,
  isDefault: true,
  features: { select: { featureCode: true }, orderBy: { featureCode: 'asc' } },
} as const;

/**
 * Lectura del catálogo de roles y membresías.
 *
 * Los catálogos viven en la base para crecer sin desplegar (ADR-0016): por eso
 * aquí se valida contra filas y no contra listas fijas en el código.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Membresías que se pueden asignar hoy, en el orden en que se ofrecen. */
  async listPlans(): Promise<PlanOption[]> {
    const planes = await this.prisma.membershipPlan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: PLAN_SELECT,
    });
    return planes.map((plan) => ({
      ...toPlanSummary(plan),
      description: plan.description,
      isDefault: plan.isDefault,
    }));
  }

  /**
   * Roles que puede asignar quien tiene ese rango: los de rango igual o inferior.
   * Del más bajo al más alto, que es el orden en que se ofrecen.
   */
  async listAssignableRoles(maxRank: number): Promise<RoleOption[]> {
    const roles = await this.prisma.role.findMany({
      where: { rank: { lte: maxRank } },
      orderBy: [{ rank: 'asc' }, { code: 'asc' }],
      select: {
        code: true,
        name: true,
        description: true,
        rank: true,
        defaultPlanCode: true,
        planExpiryRequired: true,
        permissions: { select: { permissionCode: true }, orderBy: { permissionCode: 'asc' } },
      },
    });
    return roles.map((rol) => ({
      code: rol.code,
      name: rol.name,
      description: rol.description,
      rank: rol.rank,
      defaultPlanCode: rol.defaultPlanCode,
      planExpiryRequired: rol.planExpiryRequired,
      permissions: rol.permissions.map(({ permissionCode }) => permissionCode),
    }));
  }

  /**
   * Plan a asignar: el indicado si existe y está activo; si no se indica, el que
   * propone el rol (`sugerido`) y, a falta de él, el predeterminado del catálogo.
   *
   * Un plan retirado no se asigna de nuevo, pero quien ya lo tiene lo conserva:
   * por eso `actual` se acepta aunque esté inactivo.
   */
  async resolvePlanCode(
    solicitado?: string,
    actual?: string,
    sugerido?: string | null,
  ): Promise<string> {
    if (solicitado === undefined) {
      if (sugerido) {
        const propuesto = await this.prisma.membershipPlan.findFirst({
          where: { code: sugerido, isActive: true },
          select: { code: true },
        });
        if (propuesto) {
          return propuesto.code;
        }
      }
      const predeterminado = await this.prisma.membershipPlan.findFirst({
        where: { isActive: true },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { code: 'asc' }],
        select: { code: true },
      });
      if (!predeterminado) {
        throw new BadRequestException({ code: 'PLAN_NOT_FOUND' });
      }
      return predeterminado.code;
    }
    if (solicitado === actual) {
      return solicitado;
    }
    if (!PLAN_CODE_PATTERN.test(solicitado)) {
      throw new BadRequestException({ code: 'PLAN_NOT_FOUND' });
    }
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { code: solicitado, isActive: true },
      select: { code: true },
    });
    if (!plan) {
      throw new BadRequestException({ code: 'PLAN_NOT_FOUND' });
    }
    return plan.code;
  }

  /** Rango y plan sugerido de un rol del catálogo; `ROLE_NOT_FOUND` si no existe. */
  async findRole(codigo: string): Promise<RoleRef> {
    if (!ROLE_CODE_PATTERN.test(codigo)) {
      throw new BadRequestException({ code: 'ROLE_NOT_FOUND' });
    }
    const rol = await this.prisma.role.findUnique({
      where: { code: codigo },
      select: { code: true, rank: true, defaultPlanCode: true, planExpiryRequired: true },
    });
    if (!rol) {
      throw new BadRequestException({ code: 'ROLE_NOT_FOUND' });
    }
    return rol;
  }
}
