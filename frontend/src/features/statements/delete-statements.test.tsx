import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JobPage } from '@/pages/job-page';
import { renderWithProviders } from '@/test/render';

import { JobHistory } from './job-history';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function item(id: string, nombre: string): Record<string, unknown> {
  return {
    jobId: `3333333${id}-3333-4333-8333-333333333333`,
    statementId: `2222222${id}-2222-4222-8222-222222222222`,
    sourceFileName: nombre,
    status: 'SUCCEEDED',
    createdAt: '2026-10-20T15:30:00.000Z',
    extractorId: 'bbva-account-v1',
    movementCount: 8,
    warningCount: 0,
    artifactCount: 0,
    uploadedByMe: true,
  };
}

/** Responde el historial y registra los borrados que se piden. */
function api(borrado: () => Response = () => jsonResponse(200, { deletedCount: 1 })) {
  const borrados: string[] = [];
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'DELETE') {
      borrados.push(url);
      return Promise.resolve(borrado());
    }
    return Promise.resolve(
      jsonResponse(200, {
        items: [item('1', 'Junio.pdf'), item('2', 'Julio.pdf')],
        nextCursor: null,
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { borrados };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Borrar documentos del historial', () => {
  it('borra uno tras confirmarlo y avisa', async () => {
    const { borrados } = api();
    const user = userEvent.setup();
    renderWithProviders(<JobHistory />);

    await user.click(await screen.findByRole('button', { name: 'Borrar Junio.pdf' }));
    const dialogo = screen.getByRole('dialog', { name: 'Borrar este documento' });
    expect(within(dialogo).getByText('Junio.pdf')).toBeInTheDocument();
    // El foco en «Cancelar»: un Enter distraído no borra nada.
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(borrados).toHaveLength(0);

    await user.click(within(dialogo).getByRole('button', { name: 'Borrar documento' }));

    await waitFor(() => {
      expect(borrados).toEqual([
        'http://127.0.0.1:3000/v1/statements/22222221-2222-4222-8222-222222222222',
      ]);
    });
    expect(await screen.findByText('Se borró «Junio.pdf»')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('vacía todo el historial propio con una sola petición', async () => {
    const { borrados } = api(() => jsonResponse(200, { deletedCount: 2 }));
    const user = userEvent.setup();
    renderWithProviders(<JobHistory />);

    await user.click(await screen.findByRole('button', { name: 'Vaciar historial' }));
    const dialogo = screen.getByRole('dialog', { name: 'Vaciar el historial' });
    expect(within(dialogo).getByText('2 documentos')).toBeInTheDocument();
    await user.click(within(dialogo).getByRole('button', { name: 'Vaciar historial' }));

    await waitFor(() => {
      expect(borrados).toEqual(['http://127.0.0.1:3000/v1/statements']);
    });
    expect(await screen.findByText('Se borraron 2 documentos del historial')).toBeInTheDocument();
  });

  it('cancelar no borra nada', async () => {
    const { borrados } = api();
    const user = userEvent.setup();
    renderWithProviders(<JobHistory />);

    await user.click(await screen.findByRole('button', { name: 'Borrar Julio.pdf' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(borrados).toHaveLength(0);
  });

  it(
    'si falla, lo explica con los datos para soporte y deja reintentar',
    { timeout: 15000 },
    async () => {
      api(() => jsonResponse(500, { code: 'STATEMENT_DELETE_FAILED', requestId: 'req-borrar' }));
      const user = userEvent.setup();
      renderWithProviders(<JobHistory />);

      await user.click(await screen.findByRole('button', { name: 'Borrar Junio.pdf' }));
      const dialogo = screen.getByRole('dialog');
      await user.click(within(dialogo).getByRole('button', { name: 'Borrar documento' }));

      // Un 500 se reintenta antes de rendirse (borrar es idempotente): hay que esperar.
      expect(
        await within(dialogo).findByText(
          /No se pudieron borrar todos los documentos/,
          {},
          { timeout: 8000 },
        ),
      ).toBeInTheDocument();
      expect(within(dialogo).getByText('req-borrar')).toBeInTheDocument();
      expect(within(dialogo).getByRole('button', { name: 'Borrar documento' })).toBeEnabled();
    },
  );
});

describe('Borrar desde el resultado de una conversión', () => {
  it('borra el documento y vuelve a la carga', async () => {
    const borrados: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'DELETE') {
          borrados.push(url);
          return Promise.resolve(jsonResponse(200, { deletedCount: 1 }));
        }
        return Promise.resolve(
          jsonResponse(200, {
            jobId: '33333333-3333-4333-8333-333333333333',
            statementId: '44444444-4444-4444-8444-444444444444',
            sourceFileName: 'Agosto.pdf',
            createdAt: '2026-10-20T05:30:00.000Z',
            status: 'SUCCEEDED',
            attemptNumber: 1,
            extractorId: 'bbva-account-v1',
            extractorVersion: '0.5.0',
            rowCount: 3,
            movementCount: 2,
            pageCount: 1,
            warningCodes: [],
            checks: [],
            artifacts: [],
            reused: false,
          }),
        );
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/" element={<p>Página de carga</p>} />
        <Route path="/jobs/:jobId" element={<JobPage />} />
      </Routes>,
      { ruta: '/jobs/33333333-3333-4333-8333-333333333333' },
    );

    await user.click(await screen.findByRole('button', { name: 'Borrar este documento' }));
    await user.click(screen.getByRole('button', { name: 'Borrar documento' }));

    expect(await screen.findByText('Página de carga')).toBeInTheDocument();
    expect(borrados).toEqual([
      'http://127.0.0.1:3000/v1/statements/44444444-4444-4444-8444-444444444444',
    ]);
    expect(screen.getByText('Se borró «Agosto.pdf»')).toBeInTheDocument();
  });
});
