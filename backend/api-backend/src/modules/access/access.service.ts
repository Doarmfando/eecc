import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { CreatePlanDto, UpdatePlanDto } from './dto/access.dto';
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

export interface PlanAdminOption extends PlanOption {
  isActive: boolean;
  sortOrder: number;
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
  maxPagesPerDocument: true,
  monthlyPageQuota: true,
  trialOneTime: true,
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
   * Todas las membresías, activas o no, para que un superadministrador las
   * administre. A diferencia de `listPlans`, no filtra por `isActive` ni
   * esconde el orden: es la vista de gestión, no la de alta de usuarios.
   */
  async listPlansForAdmin(): Promise<PlanAdminOption[]> {
    const planes = await this.prisma.membershipPlan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: { ...PLAN_SELECT, isActive: true, sortOrder: true },
    });
    return planes.map((plan) => ({
      ...toPlanSummary(plan),
      description: plan.description,
      isDefault: plan.isDefault,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
    }));
  }

  /**
   * Crea un plan nuevo en el catálogo. `PLAN_ALREADY_EXISTS` si el código ya
   * está en uso, aunque esté retirado: los códigos no se reutilizan (ADR-0016).
   */
  async createPlan(datos: CreatePlanDto): Promise<PlanAdminOption> {
    const existente = await this.prisma.membershipPlan.findUnique({
      where: { code: datos.code },
      select: { code: true },
    });
    if (existente) {
      throw new ConflictException({ code: 'PLAN_ALREADY_EXISTS' });
    }
    const creado = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.membershipPlan.create({
        data: {
          code: datos.code,
          name: datos.name,
          description: datos.description,
          maxPagesPerDocument: datos.maxPagesPerDocument ?? 1000,
          monthlyPageQuota: datos.monthlyPageQuota ?? null,
          trialOneTime: datos.trialOneTime ?? false,
          isDefault: datos.isDefault ?? false,
          isActive: datos.isActive ?? true,
          sortOrder: datos.sortOrder ?? 0,
        },
      });
      if (datos.features && datos.features.length > 0) {
        await tx.planFeature.createMany({
          data: datos.features.map((featureCode) => ({ planCode: plan.code, featureCode })),
        });
      }
      return plan;
    });
    return this.obtenerPlanAdmin(creado.code);
  }

  /** `PLAN_NOT_FOUND` si el código no existe. Solo escribe lo que se envía. */
  async updatePlan(code: string, cambios: UpdatePlanDto): Promise<PlanAdminOption> {
    const existente = await this.prisma.membershipPlan.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!existente) {
      throw new BadRequestException({ code: 'PLAN_NOT_FOUND' });
    }
    const datos: Prisma.MembershipPlanUpdateInput = {};
    if (cambios.name !== undefined) datos.name = cambios.name;
    if (cambios.description !== undefined) datos.description = cambios.description;
    if (cambios.maxPagesPerDocument !== undefined) {
      datos.maxPagesPerDocument = cambios.maxPagesPerDocument;
    }
    if (cambios.monthlyPageQuota !== undefined) datos.monthlyPageQuota = cambios.monthlyPageQuota;
    if (cambios.trialOneTime !== undefined) datos.trialOneTime = cambios.trialOneTime;
    if (cambios.isDefault !== undefined) datos.isDefault = cambios.isDefault;
    if (cambios.isActive !== undefined) datos.isActive = cambios.isActive;
    if (cambios.sortOrder !== undefined) datos.sortOrder = cambios.sortOrder;

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(datos).length > 0) {
        await tx.membershipPlan.update({ where: { code }, data: datos });
      }
      // Se reemplaza la lista completa: es más claro para quien administra que
      // ir sumando y restando funciones una a una.
      if (cambios.features !== undefined) {
        await tx.planFeature.deleteMany({ where: { planCode: code } });
        if (cambios.features.length > 0) {
          await tx.planFeature.createMany({
            data: cambios.features.map((featureCode) => ({ planCode: code, featureCode })),
          });
        }
      }
    });
    return this.obtenerPlanAdmin(code);
  }

  private async obtenerPlanAdmin(code: string): Promise<PlanAdminOption> {
    const plan = await this.prisma.membershipPlan.findUniqueOrThrow({
      where: { code },
      select: { ...PLAN_SELECT, isActive: true, sortOrder: true },
    });
    return {
      ...toPlanSummary(plan),
      description: plan.description,
      isDefault: plan.isDefault,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
    };
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
