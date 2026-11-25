import { toMembershipAccess, type MembershipWithAccess } from './access-catalog';

function membresia(overrides: Partial<MembershipWithAccess> = {}): MembershipWithAccess {
  return {
    planExpiresOn: null,
    trialUsedAt: null,
    monthlyPageQuotaOverride: null,
    role: { code: 'MEMBER', name: 'Usuario', rank: 10, permissions: [] },
    plan: {
      code: 'BASICA',
      name: 'Básica',
      maxRetainedStatements: 3,
      maxPagesPerDocument: 1000,
      monthlyPageQuota: 15,
      trialOneTime: false,
      features: [],
    },
    ...overrides,
  };
}

describe('toMembershipAccess: recarga de páginas puesta por un administrador', () => {
  it('sin recarga, usa el tope del plan', () => {
    const acceso = toMembershipAccess(membresia(), '2026-11-25');
    expect(acceso.plan.monthlyPageQuota).toBe(15);
  });

  it('con recarga, manda sobre el tope del plan', () => {
    const acceso = toMembershipAccess(membresia({ monthlyPageQuotaOverride: 50 }), '2026-11-25');
    expect(acceso.plan.monthlyPageQuota).toBe(50);
  });

  it('la recarga también funciona sobre un plan sin tope fijo (Atlas)', () => {
    const acceso = toMembershipAccess(
      membresia({
        monthlyPageQuotaOverride: 200,
        plan: { ...membresia().plan, code: 'ATLAS', monthlyPageQuota: null },
      }),
      '2026-11-25',
    );
    expect(acceso.plan.monthlyPageQuota).toBe(200);
  });
});
