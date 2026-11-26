import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BASIC_USER, renderWithProviders } from '@/test/render';

import { BalancePage } from './balance-page';

const OCURRIO = '2026-11-20T15:00:00.000Z';
const CURSOR = '33333333-3333-4333-8333-333333333333';

function json(datos: unknown): Response {
  return new Response(JSON.stringify(datos), { status: 200 });
}

afterEach(() => vi.unstubAllGlobals());

describe('Mi saldo', () => {
  it('muestra compras vencidas y pagina consumo en una membresía sin historial documental', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/usage/history/purchases')) {
        return Promise.resolve(
          json({
            items: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                kind: 'purchase',
                pages: 23,
                occurredAt: '2026-01-20T15:00:00.000Z',
                productName: 'ATLAS Recargas',
                priceCents: 345,
                currency: 'PEN',
                expiresOn: '2026-04-20',
              },
            ],
            nextCursor: null,
          }),
        );
      }
      if (url.includes('/usage/history/consumption')) {
        const adicional = url.includes(`cursor=${CURSOR}`);
        return Promise.resolve(
          json({
            items: [
              {
                id: adicional ? '44444444-4444-4444-8444-444444444444' : CURSOR,
                kind: 'consumption',
                pages: adicional ? 3 : 7,
                occurredAt: OCURRIO,
              },
            ],
            nextCursor: adicional ? null : CURSOR,
          }),
        );
      }
      return Promise.resolve(
        json(url.includes('/usage') ? { pagesUsed: 0, monthlyPageQuota: 10 } : []),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<BalancePage />, { usuario: BASIC_USER });
    expect(await screen.findByText(/23 páginas.*3\.45/)).toBeVisible();
    expect(await screen.findByText('7 páginas procesadas')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Ver más consumos' }));

    expect(await screen.findByText('3 páginas procesadas')).toBeVisible();
    expect(screen.getByText('7 páginas procesadas')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ver más consumos' })).not.toBeInTheDocument();
  });
});
