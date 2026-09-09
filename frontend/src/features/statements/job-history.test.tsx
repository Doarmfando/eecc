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

    expect(await screen.findByText(/Todavía no se ha procesado/)).toBeInTheDocument();
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
      vi.fn().mockResolvedValue(jsonResponse(401, { code: 'SESSION_EXPIRED' })),
    );
    renderWithProviders(<JobHistory />);

    expect(await screen.findByRole('alert')).toHaveTextContent('sesión');
  });

  it('no consulta el historial sin sesión', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<JobHistory />, { usuario: null });

    await waitFor(() => {
      expect(screen.getByText(/Cargando el historial/)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('aviso del cupo de documentos', () => {
  function mios(cantidad: number): unknown {
    return {
      items: Array.from({ length: cantidad }, (_, indice) => ({
        ...ITEM,
        jobId: `3333333${String(indice)}-3333-4333-8333-333333333333`,
        uploadedByMe: true,
      })),
      nextCursor: null,
    };
  }

  it('dice cuántos quedan mientras hay margen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, mios(1))));
    renderWithProviders(<JobHistory />);

    // El cupo de la sesión de prueba es 3.
    expect(await screen.findByText(/1 de 3 usados/)).toBeInTheDocument();
  });

  it('advierte que el siguiente borrará el más antiguo al llegar al cupo', async () => {
    // Es la advertencia que evita perder un documento sin haber sido avisado.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, mios(3))));
    renderWithProviders(<JobHistory />);

    expect(await screen.findByText(/se borrará el más antiguo/)).toBeInTheDocument();
  });

  it('no cuenta los documentos de otras personas: el cupo es por persona', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          items: [
            { ...ITEM, jobId: '11111111-1111-4111-8111-111111111111', uploadedByMe: false },
            { ...ITEM, jobId: '22222222-2222-4222-8222-222222222222', uploadedByMe: false },
            { ...ITEM, jobId: '33333333-3333-4333-8333-333333333333', uploadedByMe: true },
          ],
          nextCursor: null,
        }),
      ),
    );
    renderWithProviders(<JobHistory />);

    expect(await screen.findByText(/1 de 3 usados/)).toBeInTheDocument();
  });
});
