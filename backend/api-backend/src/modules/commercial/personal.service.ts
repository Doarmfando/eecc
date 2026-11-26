import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipStatus, Prisma, type PersonalPayment } from '@prisma/client';

import { decimalToCents } from '../../common/money/cents';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  businessToday,
  fromIsoDate,
  toIsoDate,
} from '../../common/time/business-date';
import type { AppConfig } from '../../config/app-config';
import { PLAN } from '../access/access-catalog';
import { memberActionDenial, type RankedAccount } from '../users/member-rules';
import {
  PAYMENT_REFERENCE,
  type PersonalPaymentDto,
  type PersonalPaymentInputDto,
  type PersonalStateDto,
} from './personal.dto';

const PERSONAL_PLAN = PLAN.PERSONAL;

const MEMBER_SELECT = {
  id: true,
  status: true,
  planCode: true,
  planExpiresOn: true,
  personalRenewalCancelledAt: true,
  monthlyPageQuotaOverride: true,
  role: { select: { rank: true, planExpiryRequired: true } },
} satisfies Prisma.OrganizationMembershipSelect;
type Member = Prisma.OrganizationMembershipGetPayload<{ select: typeof MEMBER_SELECT }>;

const PLAN_SELECT = {
  isActive: true,
  monthlyPageQuota: true,
  priceAmount: true,
  currency: true,
} satisfies Prisma.MembershipPlanSelect;
type Plan = Prisma.MembershipPlanGetPayload<{ select: typeof PLAN_SELECT }>;

@Injectable()
export class PersonalService {
  private readonly zone: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.zone = config.get('BUSINESS_TIMEZONE', { infer: true });
  }

  async state(
    organizationId: string,
    userId: string,
    actor?: RankedAccount,
  ): Promise<PersonalStateDto> {
    const member = await this.member(this.prisma, organizationId, userId);
    this.authorize(actor, member, userId);
    const plan = await this.plan(this.prisma);
    const payments = await this.prisma.personalPayment.findMany({
      where: { organizationId, membershipId: member.id },
      orderBy: { startsOn: 'desc' },
      take: 12,
    });
    return {
      canRegister: this.eligible(member) && this.validPlan(plan),
      currentPlan: member.planCode,
      expiresOn: member.planExpiresOn ? toIsoDate(member.planExpiresOn) : null,
      renewalCancelledAt: member.personalRenewalCancelledAt?.toISOString() ?? null,
      priceCents: plan?.priceAmount ? decimalToCents(plan.priceAmount) : null,
      currency: plan?.currency ?? null,
      payments: payments.map(toPayment),
    };
  }

  async register(
    organizationId: string,
    userId: string,
    actor: RankedAccount,
    input: PersonalPaymentInputDto,
  ): Promise<PersonalPaymentDto> {
    const reference = input.reference.trim().toUpperCase();
    if (!PAYMENT_REFERENCE.test(reference))
      throw new BadRequestException({ code: 'PAYMENT_REFERENCE_INVALID' });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const member = await this.lockMember(tx, organizationId, userId);
        this.authorize(actor, member, userId);
        const registered = await tx.personalPayment.findUnique({
          where: { organizationId_reference: { organizationId, reference } },
        });
        if (registered) {
          if (
            registered.membershipId !== member.id ||
            decimalToCents(registered.amount) !== input.priceCents ||
            registered.currency !== input.currency
          ) {
            throw new ConflictException({ code: 'PAYMENT_REFERENCE_USED' });
          }
          return toPayment(registered);
        }

        if (!this.eligible(member))
          throw new ConflictException({ code: 'PERSONAL_TRANSITION_REQUIRED' });
        const plan = await this.plan(tx);
        if (!this.validPlan(plan)) throw new ConflictException({ code: 'PERSONAL_UNAVAILABLE' });
        if (
          decimalToCents(plan.priceAmount) !== input.priceCents ||
          plan.currency !== input.currency
        ) {
          throw new ConflictException({ code: 'PERSONAL_PRICE_CHANGED' });
        }
        const now = new Date();
        const today = businessToday(this.zone, now);
        const expiresOn = member.planExpiresOn && toIsoDate(member.planExpiresOn);
        const renewal =
          member.planCode === PERSONAL_PLAN && expiresOn !== null && expiresOn >= today;
        const startsOn = renewal ? addDaysToIsoDate(expiresOn, 1) : today;
        const latest = await tx.personalPayment.findFirst({
          where: { membershipId: member.id },
          orderBy: { endsOn: 'desc' },
        });
        if (latest && toIsoDate(latest.endsOn) > startsOn) {
          throw new ConflictException({ code: 'PERSONAL_SCHEDULE_CONFLICT' });
        }
        // El primer día de la cadena fija la cadencia aunque febrero recorte el día.
        const previous = renewal && latest && toIsoDate(latest.endsOn) === startsOn ? latest : null;
        const anchor = previous ? toIsoDate(previous.anchorOn) : startsOn;
        const current = fromIsoDate(startsOn);
        const first = fromIsoDate(anchor);
        const offset =
          (current.getUTCFullYear() - first.getUTCFullYear()) * 12 +
          current.getUTCMonth() -
          first.getUTCMonth();
        const endsOn = addMonthsToIsoDate(anchor, offset + 1);

        const payment = await tx.personalPayment.create({
          data: {
            organizationId,
            membershipId: member.id,
            reference,
            amount: plan.priceAmount,
            currency: plan.currency,
            pages: plan.monthlyPageQuota,
            startsOn: current,
            endsOn: fromIsoDate(endsOn),
            anchorOn: first,
            recordedAt: now,
          },
        });
        await tx.organizationMembership.update({
          where: { id: member.id },
          data: {
            planCode: PERSONAL_PLAN,
            planExpiresOn: fromIsoDate(addDaysToIsoDate(endsOn, -1)),
            personalRenewalCancelledAt: null,
            ...(!renewal ? { planChangedAt: now, periodAnchorAt: now } : {}),
          },
        });
        await tx.auditEvent.create({
          data: {
            organizationId,
            actorUserId: actor.userId,
            action: 'personal.payment_recorded',
            entityType: 'personal_payment',
            entityId: payment.id,
          },
        });
        return toPayment(payment);
      });
    } catch (error) {
      // Dos cuentas distintas podrían registrar la misma referencia simultáneamente.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'PAYMENT_REFERENCE_USED' });
      }
      throw error;
    }
  }

  async cancelRenewal(organizationId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const member = await this.lockMember(tx, organizationId, userId);
      if (member.planCode !== PERSONAL_PLAN)
        throw new ConflictException({ code: 'PERSONAL_UNAVAILABLE' });
      if (member.personalRenewalCancelledAt) return;
      await tx.organizationMembership.update({
        where: { id: member.id },
        data: { personalRenewalCancelledAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: 'personal.renewal_cancelled',
          entityType: 'membership',
          entityId: member.id,
        },
      });
    });
  }

  private eligible(member: Member): boolean {
    return (
      member.status === MembershipStatus.ACTIVE &&
      member.role.planExpiryRequired &&
      member.monthlyPageQuotaOverride === null &&
      (member.planCode === 'GRATUITO' ||
        (member.planCode === PERSONAL_PLAN && member.planExpiresOn !== null))
    );
  }

  private validPlan(
    plan: Plan | null,
  ): plan is Plan & { priceAmount: Prisma.Decimal; monthlyPageQuota: number } {
    return !!plan?.isActive && !!plan.monthlyPageQuota && !!plan.priceAmount?.gt(0);
  }

  private authorize(actor: RankedAccount | undefined, member: Member, userId: string): void {
    const denial =
      actor && memberActionDenial(actor, { userId, rank: member.role.rank }, 'CHANGE_PLAN');
    if (denial) throw new ForbiddenException({ code: denial });
  }

  private plan(tx: Prisma.TransactionClient): Promise<Plan | null> {
    return tx.membershipPlan.findUnique({ where: { code: PERSONAL_PLAN }, select: PLAN_SELECT });
  }

  private async member(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<Member> {
    const member = await tx.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: MEMBER_SELECT,
    });
    if (!member) throw new NotFoundException({ code: 'MEMBER_NOT_FOUND' });
    return member;
  }

  private async lockMember(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<Member> {
    const key = `${organizationId}:${userId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    await tx.$queryRaw`SELECT id FROM organization_memberships WHERE organization_id = ${organizationId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
    return this.member(tx, organizationId, userId);
  }
}

function toPayment(payment: PersonalPayment): PersonalPaymentDto {
  return {
    id: payment.id,
    priceCents: decimalToCents(payment.amount),
    currency: payment.currency,
    pages: payment.pages,
    startsOn: toIsoDate(payment.startsOn),
    paidThrough: addDaysToIsoDate(toIsoDate(payment.endsOn), -1),
    recordedAt: payment.recordedAt.toISOString(),
  };
}
