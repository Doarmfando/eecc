import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CommercialReport } from '@/lib/commercial-report';
import { saveBlob } from '@/lib/save-file';
import { renderWithProviders, TEST_USER } from '@/test/render';

import { CommercialReportPage } from './commercial-report-page';

vi.mock('@/lib/save-file', () => ({ saveBlob: vi.fn() }));

const report: CommercialReport = {
  window: {
    from: '2026-11-01',
    to: '2026-11-26',
    asOf: '2026-11-26T15:00:00.000Z',
    zone: 'America/Lima',
  },
  accounts: {
    registered: 4,
    free: 2,
    personalActive: 1,
    expired: 1,
    cancelled: 0,
    freeCohort: 2,
    converted: 1,
  },
  sales: [
    {
      product: 'PERSONAL',
      kind: 'MEMBERSHIP',
      currency: 'PEN',
      payments: 1,
      pagesSold: 50,
      revenueCents: 1990,
      activeMonthlyCents: 1990,
    },
  ],
  credits: [
    {
      product: 'PERSONAL',
      granted: 50,
      available: 40,
      held: 0,
      expired: 0,
      consumed: 10,
      estimatedCostCents: null,
    },
  ],
  operations: [{ status: 'SUCCEEDED', count: 1, pages: 10 }],
  users: [{ userId: TEST_USER.userId, pages: 10, estimatedCostCents: null }],
  estimatedCostPerPagePen: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function leer(blob: Blob): Promise<string | ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(new Error('No se pudo leer la exportación.'));
    };
    reader.readAsText(blob);
  });
}

describe('Panel comercial', () => {
  it('aplica cuenta, producto y estado y exporta el informe filtrado', async () => {
    const fetch = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          Response.json(
            url.includes('/v1/users')
              ? [{ userId: TEST_USER.userId, displayName: 'Persona sintética' }]
              : url.includes('/v1/commercial-products')
                ? []
                : report,
          ),
        ),
      );
    vi.stubGlobal('fetch', fetch);
    renderWithProviders(<CommercialReportPage />);
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'Ingresos confirmados' })).toBeVisible();
    expect(screen.getByText(/^50\s*%$/)).toBeVisible();
    expect(await screen.findByRole('option', { name: 'Persona sintética' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Cuenta'), TEST_USER.userId);
    await user.type(screen.getByLabelText('Producto'), 'personal');
    await user.selectOptions(screen.getByLabelText('Estado del procesamiento'), 'SUCCEEDED');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          `organizationId=${TEST_USER.organizationId}&userId=${TEST_USER.userId}&product=PERSONAL&status=SUCCEEDED`,
        ),
        expect.anything(),
      );
    });
    const exportar = screen.getByRole('button', { name: 'Exportar CSV' });
    await waitFor(() => {
      expect(exportar).toBeEnabled();
    });
    await user.click(exportar);
    const download = vi.mocked(saveBlob).mock.calls[0];
    expect(download?.[1]).toBe('atlas-comercial-2026-11-01-2026-11-26.csv');
    if (!download) throw new Error('No se exportó el informe');
    const csv = await leer(download[0]);
    expect(csv).toContain('"PERSONAL";"Membresías";"PEN";1;50;1990');
    expect(csv).not.toContain('Persona sintética');
  });
});
