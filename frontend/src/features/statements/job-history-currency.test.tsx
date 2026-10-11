import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse, stubApi } from '@/test/financial-api';
import { renderWithProviders } from '@/test/render';

import { JobHistory } from './job-history';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Dos documentos procesados: uno en soles (BCP) y otro en dólares (BBVA). */
const DOCS: Record<string, { extractorId: string; moneda: string }> = {
  'job-pen': { extractorId: 'bcp-coordinate-v1', moneda: 'PEN' },
  'job-usd': { extractorId: 'bbva-account-v1', moneda: 'USD' },
};

const MOVIMIENTOS_CSV = [
  'Página,Tipo de fila,Fecha proceso,Fecha valor,Descripción,Cargo,Abono,Saldo',
  '1,MOVEMENT,2026-07-02,2026-07-02,Abono de la prueba,,5.00,105.00',
  '',
].join('\r\n');

function listItem(jobId: string, extractorId: string): unknown {
  return {
    jobId,
    statementId: 'stmt',
    status: 'SUCCEEDED',
    createdAt: '2026-09-20T10:00:00.000Z',
    extractorId,
    movementCount: 1,
    warningCount: 0,
    artifactCount: 3,
    uploadedByMe: true,
  };
}

function stubTwoCurrencies(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const artifact = /\/v1\/jobs\/([\w-]+)\/artifacts\/(\w+)\/content/.exec(url);
      if (artifact) {
        const moneda = DOCS[artifact[1] ?? '']?.moneda ?? '';
        return Promise.resolve(
          new Response(
            artifact[2] === 'mov' ? MOVIMIENTOS_CSV : `Estado,Moneda\r\nSUCCEEDED,${moneda}\r\n`,
          ),
        );
      }
      const detail = /\/v1\/jobs\/([\w-]+)$/.exec(url);
      if (detail) {
        const jobId = detail[1] ?? '';
        return Promise.resolve(
          jsonResponse({
            jobId,
            statementId: 'stmt',
            status: 'SUCCEEDED',
            attemptNumber: 1,
            extractorId: DOCS[jobId]?.extractorId,
            extractorVersion: '1.0.0',
            rowCount: 1,
            movementCount: 1,
            pageCount: 1,
            warningCodes: [],
            checks: [],
            artifacts: [
              { id: 'mov', kind: 'RESULT_CSV', byteSize: 1, name: 'statement_Movimientos.csv' },
              { id: 'res', kind: 'RESULT_CSV', byteSize: 1, name: 'statement_Resumen.csv' },
            ],
            reused: false,
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          items: Object.entries(DOCS).map(([jobId, doc]) => listItem(jobId, doc.extractorId)),
          nextCursor: null,
        }),
      );
    }),
  );
}

describe('JobHistory: filtro de moneda', () => {
  it('muestra solo los documentos de la moneda elegida', async () => {
    const user = userEvent.setup();
    stubTwoCurrencies();
    renderWithProviders(<JobHistory />);

    const group = await screen.findByRole('radiogroup', { name: 'Moneda' });
    expect(within(group).getByRole('radio', { name: 'Todas' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('BCP')).toBeInTheDocument();
    expect(screen.getByText('BBVA')).toBeInTheDocument();

    await user.click(within(group).getByRole('radio', { name: /Dólares/ }));
    expect(screen.getByText('BBVA')).toBeInTheDocument();
    expect(screen.queryByText('BCP')).not.toBeInTheDocument();

    await user.click(within(group).getByRole('radio', { name: 'Todas' }));
    expect(screen.getByText('BCP')).toBeInTheDocument();
  });

  it('con una sola moneda no ofrece filtrar', async () => {
    stubApi();
    renderWithProviders(<JobHistory />);

    await screen.findByText('Setiembre de 2026 · S/ Soles');
    expect(screen.queryByRole('radiogroup', { name: 'Moneda' })).not.toBeInTheDocument();
  });
});
