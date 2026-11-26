import { ForbiddenException } from '@nestjs/common';

import type { FeatureCode } from '../../modules/access/access-catalog';
import type { OrganizationContext } from '../http/request-context';

export function hasPlanFeature(context: OrganizationContext, feature: FeatureCode): boolean {
  return context.apiKeyId !== null || context.plan?.features.includes(feature) === true;
}

export function requirePlanFeature(context: OrganizationContext, feature: FeatureCode): void {
  if (!hasPlanFeature(context, feature)) {
    throw new ForbiddenException({ code: 'PLAN_FEATURE_REQUIRED' });
  }
}
