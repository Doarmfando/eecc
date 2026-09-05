import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { formatProcessedAt } from './format-processed-at';
import { JobHistory } from './job-history';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ITEM = {
  jobId: '33333333-3333-4333-8333-333333333333',
  statementId: '22222222-2222-4222-8222-222222222222',
  status: 'NEEDS_REVIEW',
  createdAt: '2026-08-26T15:30:00.000Z',
  extractorId: 'bcp-coordinate-v1',
  movementCount: 8,
  warningCount: 2,
  artifactCount: 5,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('formatProcessedAt', () => {
  it('no inventa una fecha cuando el valor es inválido', () => {
    expect(formatProcessedAt('no es fecha')).toBe('—');
    expect(formatProcessedAt(ITEM.createdAt)).not.toBe('—');
  });
});

describe('JobHistory', () => {
  it('lista los documentos procesados con su estado y conteos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { items: [ITEM], nextCursor: null })),
    );
    renderWithProviders(<JobHistory />);

    expect(await screen.findByTestId('status-badge')).toHaveTextContent('Requiere revisión');
    expect(screen.getByText(/8 movimientos/)).toBeInTheDocument();
    expect(screen.getByText(/2 advertencias/)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', `/jobs/${ITEM.jobId}`);
  });

  it('declara el estado vacío en lugar de mostrar una lista sin filas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { items: [], nextCursor: null })),
    );
    renderWithProviders(<JobHistory />);

    expect(await screen.findByText(/Todavía no has procesado/)).toBeInTheDocument();
  });

  it('avisa cuando hay documentos más antiguos que los mostrados', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { items: [ITEM], nextCursor: 'abc' })),
    );
    renderWithProviders(<JobHistory />);

    expect(await screen.findByText(/documentos más antiguos/)).toBeInTheDocument();
  });

  it('muestra el motivo cuando el servidor rechaza la consulta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { code: 'API_KEY_INVALID' })),
    );
    renderWithProviders(<JobHistory />);

    expect(await screen.findByRole('alert')).toHaveTextContent('credencial');
  });

  it('no consulta el historial sin credencial', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<JobHistory />, { apiKey: '' });

    await waitFor(() => {
      expect(screen.getByText(/Cargando el historial/)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
