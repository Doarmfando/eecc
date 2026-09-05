import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render';

import type { Job } from '@/types/job';

import { JobSummary } from './job-summary';

function job(overrides: Partial<Job> = {}): Job {
  return {
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
    checks: [{ code: 'BCP_ROWS_PRESENT', status: 'PASSED' }],
    artifacts: [{ id: 'a', kind: 'RESULT_XLSX', byteSize: 100, name: 'statement.xlsx' }],
    reused: false,
    ...overrides,
  };
}

describe('JobSummary', () => {
  it('no muestra advertencias ni avisos cuando el documento reconcilia', () => {
    renderWithProviders(<JobSummary job={job()} />);

    expect(screen.getByTestId('status-badge')).toHaveTextContent('Reconciliado');
    // "Advertencias" también es una métrica; aquí interesa la tarjeta con ese título.
    expect(screen.queryByRole('heading', { name: 'Advertencias' })).not.toBeInTheDocument();
    expect(screen.queryByText(/reutilizó el resultado/)).not.toBeInTheDocument();
  });

  it('explica que un resultado fallido no publica archivos', () => {
    renderWithProviders(<JobSummary job={job({ status: 'FAILED', artifacts: [], rowCount: 0 })} />);

    expect(screen.getByTestId('status-badge')).toHaveTextContent('Fallido');
    expect(
      screen.getByText('La extracción no produjo un resultado utilizable'),
    ).toBeInTheDocument();
    expect(screen.getByText(/no publicó archivos/)).toBeInTheDocument();
  });

  it('avisa cuando el resultado se reutilizó por idempotencia', () => {
    renderWithProviders(<JobSummary job={job({ reused: true })} />);

    expect(screen.getByText(/reutilizó el resultado/)).toBeInTheDocument();
  });

  it('muestra advertencias aunque el estado sea reconciliado', () => {
    renderWithProviders(<JobSummary job={job({ warningCodes: ['BCP_INVALID_DATE'] })} />);

    expect(screen.getByRole('heading', { name: 'Advertencias' })).toBeInTheDocument();
    expect(
      screen.getByText('Una fila tiene fecha inválida y quedó sin clasificar.'),
    ).toBeInTheDocument();
  });
});
