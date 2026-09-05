import { describe, expect, it } from 'vitest';

import type { Job } from '@/types/job';

import { jobQueryKey, pollInterval } from './queries';

function job(status: Job['status']): Job {
  return {
    jobId: 'job-id',
    statementId: 'statement-id',
    status,
    attemptNumber: 1,
    extractorId: 'bcp-coordinate-v1',
    extractorVersion: '0.1.0',
    rowCount: 0,
    movementCount: 0,
    pageCount: 0,
    warningCodes: [],
    checks: [],
    artifacts: [],
    reused: false,
  };
}

describe('pollInterval', () => {
  it('detiene el polling en cuanto el estado es terminal', () => {
    for (const status of ['SUCCEEDED', 'NEEDS_REVIEW', 'FAILED'] as const) {
      expect(pollInterval(job(status), 0)).toBe(false);
    }
  });

  it('sigue consultando mientras el trabajo no termina', () => {
    expect(pollInterval(job('PROCESSING'), 0)).toBe(2000);
    expect(pollInterval(undefined, 0)).toBe(2000);
  });

  it('aplica backoff acotado ante fallos consecutivos', () => {
    expect(pollInterval(job('QUEUED'), 1)).toBe(4000);
    expect(pollInterval(job('QUEUED'), 3)).toBe(16000);
    expect(pollInterval(job('QUEUED'), 10)).toBe(30000);
  });

  it('usa una clave de caché por trabajo', () => {
    expect(jobQueryKey('abc')).toEqual(['job', 'abc']);
    expect(jobQueryKey('abc')).not.toEqual(jobQueryKey('def'));
  });
});
