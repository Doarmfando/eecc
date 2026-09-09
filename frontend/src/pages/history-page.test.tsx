import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { HistoryPage } from './history-page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HistoryPage', () => {
  it('encabeza la página y monta el historial', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], nextCursor: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    renderWithProviders(<HistoryPage />);

    expect(screen.getByRole('heading', { name: 'Documentos procesados' })).toBeInTheDocument();
    expect(await screen.findByText(/Todavía no se ha procesado/)).toBeInTheDocument();
  });
});
