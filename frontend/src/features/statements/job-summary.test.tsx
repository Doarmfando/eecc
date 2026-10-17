import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  it('identifica el resultado con el nombre original recibido del servidor', () => {
    renderWithProviders(
      <JobSummary job={job({ sourceFileName: 'Cuenta sintética agosto.pdf' })} />,
    );
    expect(screen.getByText('Cuenta sintética agosto.pdf')).toBeVisible();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('dice cuándo se convirtió y nombra cada archivo como el PDF que se subió', () => {
    renderWithProviders(
      <JobSummary
        job={job({
          sourceFileName: 'EECC BBVA AGOSTO.pdf',
          createdAt: '2026-10-17T05:30:00.000Z',
          artifacts: [
            { id: 'x', kind: 'RESULT_XLSX', byteSize: 100, name: 'statement.xlsx' },
            { id: 'p', kind: 'SOURCE_PDF', byteSize: 900, name: 'source.pdf' },
          ],
        })}
      />,
    );

    expect(screen.getByText(/^Convertido el /)).toBeVisible();
    expect(screen.getByText('EECC BBVA AGOSTO.xlsx')).toBeVisible();
    // El PDF se presenta con su nombre real; «PDF original» queda como detalle.
    expect(screen.getAllByText('EECC BBVA AGOSTO.pdf')).toHaveLength(2);
    expect(screen.getByText(/^PDF original · /)).toBeVisible();
    // Los datos técnicos ya no encabezan el resultado, pero siguen en las invariantes.
    expect(screen.getByText(/Comprobadas por bcp-coordinate-v1 0\.1\.0/)).toBeVisible();
  });

  it('mantiene la revisión sin afirmar un descuadre cuando solo hay filas sin clasificar', () => {
    renderWithProviders(
      <JobSummary job={job({ status: 'NEEDS_REVIEW', warningCodes: ['BBVA_ROW_UNCLASSIFIED'] })} />,
    );
    expect(
      screen.getByText(
        'El archivo se generó, pero hay advertencias o verificaciones pendientes. Revisa el detalle antes de usarlo como definitivo.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/las cifras no reconcilian/)).not.toBeInTheDocument();
  });

  it('muestra el error al fallar la descarga del Excel y permite reintentar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'ARTIFACT_NOT_FOUND' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    renderWithProviders(<JobSummary job={job()} />);
    const button = screen.getByRole('button', { name: /Descargar Excel/ });
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ese archivo ya no está disponible para descargar.',
    );
    expect(button).toBeEnabled();
  });
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
