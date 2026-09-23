import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { JobListItem } from '@/types/job';

import { StatementSelector } from './statement-selector';

const JOBS: JobListItem[] = [
  {
    jobId: 'job-bcp',
    statementId: 'stmt-bcp',
    status: 'SUCCEEDED',
    createdAt: '2026-09-15T14:30:00.000Z',
    extractorId: 'bcp-coordinate-v1',
    movementCount: 42,
    warningCount: 0,
    artifactCount: 6,
    uploadedByMe: true,
  },
  {
    jobId: 'job-interbank',
    statementId: 'stmt-interbank',
    status: 'NEEDS_REVIEW',
    createdAt: '2026-08-02T09:00:00.000Z',
    extractorId: 'interbank-savings-v1',
    movementCount: 17,
    warningCount: 3,
    artifactCount: 6,
    uploadedByMe: true,
  },
];

describe('StatementSelector', () => {
  it('lista los documentos del historial con todos preseleccionados', () => {
    render(<StatementSelector jobs={JOBS} onConfirm={vi.fn()} />);

    expect(screen.getByText(/^BCP —/)).toBeInTheDocument();
    expect(screen.getByText(/^Interbank —/)).toBeInTheDocument();
    expect(screen.getByText('2 de 2 seleccionados')).toBeInTheDocument();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeChecked();
    }
  });

  it('resume cada documento con sus movimientos y advertencias', () => {
    render(<StatementSelector jobs={JOBS} onConfirm={vi.fn()} />);

    expect(screen.getByText('42 movimientos')).toBeInTheDocument();
    expect(screen.getByText('17 movimientos · 3 advertencias')).toBeInTheDocument();
  });

  it('nombra el banco aunque el selector de carga todavía no lo ofrezca', () => {
    const nacion: JobListItem = { ...JOBS[0]!, jobId: 'job-bn', extractorId: 'banco-nacion-v1' };
    render(<StatementSelector jobs={[nacion]} onConfirm={vi.fn()} />);

    expect(screen.getByText(/^Banco de la Nación —/)).toBeInTheDocument();
  });

  it('deja destildar uno y lo refleja en el contador', async () => {
    const user = userEvent.setup();
    render(<StatementSelector jobs={JOBS} onConfirm={vi.fn()} />);

    await user.click(screen.getAllByRole('checkbox')[0]!);

    expect(screen.getByText('1 de 2 seleccionados')).toBeInTheDocument();
  });

  it('deshabilita "Consolidar y analizar" si no queda nada marcado', async () => {
    const user = userEvent.setup();
    render(<StatementSelector jobs={JOBS} onConfirm={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Quitar todos' }));

    expect(screen.getByRole('button', { name: 'Consolidar y analizar' })).toBeDisabled();
  });

  it('entrega los identificadores de trabajo seleccionados al confirmar', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<StatementSelector jobs={JOBS} onConfirm={onConfirm} />);

    await user.click(screen.getAllByRole('checkbox')[1]!);
    await user.click(screen.getByRole('button', { name: 'Consolidar y analizar' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toEqual(new Set(['job-bcp']));
  });
});
