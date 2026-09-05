import { describe, expect, it } from 'vitest';

import { isTerminal, jobSchema, requiresReview } from './job';

const BASE = {
  jobId: 'job-id',
  statementId: 'statement-id',
  status: 'SUCCEEDED',
  attemptNumber: 1,
  extractorId: 'bcp-coordinate-v1',
  extractorVersion: '0.1.0',
  rowCount: 4,
  movementCount: 1,
  pageCount: 1,
  warningCodes: [],
  checks: [],
  artifacts: [],
  reused: false,
};

describe('contrato del trabajo', () => {
  it('acepta una respuesta completa y rechaza formas inesperadas', () => {
    expect(jobSchema.safeParse(BASE).success).toBe(true);
    expect(jobSchema.safeParse({ ...BASE, status: 'INVENTADO' }).success).toBe(false);
    expect(jobSchema.safeParse({ ...BASE, rowCount: -1 }).success).toBe(false);
    expect(jobSchema.safeParse({ ...BASE, warningCodes: 'ninguna' }).success).toBe(false);
  });

  it('distingue estados terminales de los que siguen en curso', () => {
    expect(isTerminal('SUCCEEDED')).toBe(true);
    expect(isTerminal('NEEDS_REVIEW')).toBe(true);
    expect(isTerminal('FAILED')).toBe(true);
    expect(isTerminal('PROCESSING')).toBe(false);
    expect(isTerminal('QUEUED')).toBe(false);
  });

  it('marca revisión cuando hay discrepancias o advertencias', () => {
    const parsed = jobSchema.parse(BASE);
    expect(requiresReview(parsed)).toBe(false);
    expect(requiresReview({ ...parsed, status: 'NEEDS_REVIEW' })).toBe(true);
    expect(requiresReview({ ...parsed, warningCodes: ['BCP_AMOUNT_UNPARSEABLE'] })).toBe(true);
  });
});
