import { allowedMemberActions, canAssignRole, memberActionDenial } from './member-rules';

const SUPER = { userId: 'super', rank: 100 };
const OTRO_SUPER = { userId: 'otro-super', rank: 100 };
const ADMIN = { userId: 'admin', rank: 50 };
const OTRO_ADMIN = { userId: 'otro-admin', rank: 50 };
const USUARIO = { userId: 'usuario', rank: 10 };

const TODAS = [
  'EDIT_PROFILE',
  'CHANGE_PLAN',
  'CHANGE_ROLE',
  'CHANGE_STATUS',
  'RESET_PASSWORD',
  'DELETE',
];

describe('member-rules', () => {
  it('sobre un rango inferior se puede todo', () => {
    expect(allowedMemberActions(ADMIN, USUARIO)).toEqual(TODAS);
    expect(allowedMemberActions(SUPER, ADMIN)).toEqual(TODAS);
  });

  it('entre pares solo lo reversible, como entre administradores en ADR-0008', () => {
    expect(allowedMemberActions(ADMIN, OTRO_ADMIN)).toEqual([
      'EDIT_PROFILE',
      'CHANGE_PLAN',
      'CHANGE_STATUS',
      'RESET_PASSWORD',
    ]);
    expect(memberActionDenial(ADMIN, OTRO_ADMIN, 'DELETE')).toBe('ADMIN_CANNOT_BE_DELETED');
    expect(memberActionDenial(ADMIN, OTRO_ADMIN, 'CHANGE_ROLE')).toBe('ADMIN_CANNOT_BE_DEMOTED');
    expect(memberActionDenial(SUPER, OTRO_SUPER, 'DELETE')).toBe('ADMIN_CANNOT_BE_DELETED');
  });

  it('sobre un rango superior no se puede nada', () => {
    expect(allowedMemberActions(ADMIN, SUPER)).toEqual([]);
    expect(memberActionDenial(ADMIN, SUPER, 'EDIT_PROFILE')).toBe('ROLE_ABOVE_YOURS');
  });

  it('sobre la propia cuenta, solo datos y plan', () => {
    expect(allowedMemberActions(ADMIN, ADMIN)).toEqual(['EDIT_PROFILE', 'CHANGE_PLAN']);
    expect(memberActionDenial(SUPER, SUPER, 'CHANGE_STATUS')).toBe('CANNOT_MODIFY_SELF');
  });

  it('se asignan roles de rango igual o inferior, nunca superior', () => {
    expect(canAssignRole(50, 10)).toBe(true);
    expect(canAssignRole(50, 50)).toBe(true);
    expect(canAssignRole(50, 100)).toBe(false);
  });
});
