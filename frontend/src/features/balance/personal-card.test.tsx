import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { PersonalCard } from './personal-card';

const userId = '22222222-2222-4222-8222-222222222222';
const vigencia = '2099-12-31';
const base = {
  canRegister: true,
  currentPlan: 'PERSONAL',
  expiresOn: vigencia,
  renewalCancelledAt: null,
  priceCents: 1990,
  currency: 'PEN',
  payments: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('Ciclo de ATLAS Personal', () => {
  it('envía el comprobante y el importe confirmado al registrar un pago', async () => {
    const payment = {
      id: userId,
      priceCents: 1990,
      currency: 'PEN',
      pages: 50,
      startsOn: '2099-12-01',
      paidThrough: vigencia,
      recordedAt: '2099-12-01T05:00:00.000Z',
    };
    const fetchMock = vi
      .fn()
      .mockImplementation((_url: string, init?: RequestInit) =>
        Promise.resolve(Response.json(init?.method === 'POST' ? payment : base)),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<PersonalCard userId={userId} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Registrar pago de Personal' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Número de operación de Yape'), 'YAPE-32');
    await user.click(dialog.getByRole('button', { name: 'Confirmar registro' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/v1/personal/users/${userId}/payments`),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reference: 'YAPE-32', priceCents: 1990, currency: 'PEN' }),
        }),
      );
    });
  });

  it('conserva la fecha pagada al cancelar la próxima renovación', async () => {
    let cancelada = false;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          cancelada = true;
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.resolve(
          Response.json({
            ...base,
            renewalCancelledAt: cancelada ? '2099-12-01T05:00:00.000Z' : null,
          }),
        );
      }),
    );
    renderWithProviders(<PersonalCard />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cancelar renovación' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
    expect(await screen.findByText('Renovación cancelada')).toBeVisible();
    expect(screen.getByText(/Vigencia hasta el 31/)).toBeVisible();
  });
});
