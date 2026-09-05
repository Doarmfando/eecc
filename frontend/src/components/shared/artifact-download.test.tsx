import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, TEST_API_KEY } from '@/test/render';

import { ArtifactList } from './artifact-list';

const JOB_ID = '33333333-3333-4333-8333-333333333333';
const ARTIFACT_ID = '44444444-4444-4444-8444-444444444444';

const saveBlob = vi.hoisted(() => vi.fn());
vi.mock('@/lib/save-file', () => ({ saveBlob }));

const ARTIFACTS = [
  { id: ARTIFACT_ID, kind: 'RESULT_XLSX', byteSize: 2048, name: 'statement.xlsx' },
];

afterEach(() => {
  vi.unstubAllGlobals();
  saveBlob.mockReset();
});

describe('descarga de artefactos', () => {
  it('pide el archivo a la ruta autorizada y lo entrega con el nombre del servidor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['contenido']), {
        status: 200,
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': `attachment; filename="${JOB_ID}.xlsx"`,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ArtifactList jobId={JOB_ID} artifacts={ARTIFACTS} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /Descargar/ }));

    await waitFor(() => {
      expect(saveBlob).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:3000/v1/jobs/${JOB_ID}/artifacts/${ARTIFACT_ID}/content`);
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(TEST_API_KEY);
    expect(saveBlob.mock.calls[0]?.[1]).toBe(`${JOB_ID}.xlsx`);
  });

  it('muestra el motivo cuando el servidor niega la descarga', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'ARTIFACT_NOT_FOUND' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    renderWithProviders(<ArtifactList jobId={JOB_ID} artifacts={ARTIFACTS} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /Descargar/ }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it('no intenta descargar sin credencial', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ArtifactList jobId={JOB_ID} artifacts={ARTIFACTS} />, { apiKey: '' });

    await userEvent.setup().click(screen.getByRole('button', { name: /Descargar/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('credencial');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
