import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionUser } from '@/lib/session-client';
import { BASIC_USER, TEST_USER, renderWithProviders } from '@/test/render';

// Contar páginas de verdad exige un PDF bien formado; aquí interesa la lógica
// del aviso, no la de pdf.js, así que se controla el resultado directamente.
const { countPdfPages } = vi.hoisted(() => ({ countPdfPages: vi.fn() }));
vi.mock('@/lib/pdf-pages', () => ({ countPdfPages }));

import { PageQuotaNotice } from './page-quota-notice';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function lote(
  source: string,
  quantity: number,
  available: number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `${source}-1`,
    source,
    quantity,
    consumed: quantity - available,
    held: 0,
    available,
    startsAt: '2026-11-15T05:00:00.000Z',
    expiresAt: '2026-12-15T05:00:00.000Z',
    productName: source === 'PURCHASE' ? 'ATLAS Recargas' : null,
    ...extra,
  };
}

const PERIODO = { startsAt: '2026-11-15T05:00:00.000Z', endsAt: '2026-12-15T05:00:00.000Z' };

/** Periodo de la membresía con `periodo` páginas libres, más `compradas` de una recarga. */
function stubSaldo(periodo: number, compradas = 0): void {
  const lotes = [lote('MEMBERSHIP_PERIOD', 50, periodo)];
  if (compradas > 0) {
    lotes.push(lote('PURCHASE', compradas, compradas, { expiresAt: '2027-02-25T05:00:00.000Z' }));
  }
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      jsonResponse(200, {
        pagesUsed: 50 - periodo,
        monthlyPageQuota: 50,
        unlimited: false,
        membershipExpired: false,
        pagesAvailable: periodo + compradas,
        period: PERIODO,
        lots: lotes,
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  countPdfPages.mockReset();
});

describe('PageQuotaNotice', () => {
  it('sin plan en la sesión, no muestra nada', () => {
    renderWithProviders(<PageQuotaNotice selectedFile={null} />, { usuario: null });
    expect(screen.queryByText(/páginas/)).not.toBeInTheDocument();
  });

  it('dice cuántas páginas le quedan y de dónde salen', async () => {
    stubSaldo(38, 40);
    const { container } = renderWithProviders(<PageQuotaNotice selectedFile={null} />, {
      usuario: BASIC_USER,
    });

    await waitFor(() => {
      expect(container.textContent).toMatch(
        /Te quedan 78 páginas \(38 de tu membresía este periodo y 40 compradas\)/,
      );
    });
    expect(screen.getByRole('link', { name: 'Ver mi saldo' })).toHaveAttribute('href', '/saldo');
  });

  it('mientras cuenta las páginas de un archivo pesado, avisa que está analizando', async () => {
    stubSaldo(10);
    let resolver: (paginas: number) => void = () => undefined;
    countPdfPages.mockReturnValue(
      new Promise<number>((resolve) => {
        resolver = resolve;
      }),
    );
    const archivo = new File(['contenido'], 'estado.pdf', { type: 'application/pdf' });
    renderWithProviders(<PageQuotaNotice selectedFile={archivo} />, { usuario: BASIC_USER });

    expect(
      await screen.findByText('Analizando tu archivo: contando sus páginas…'),
    ).toBeInTheDocument();

    resolver(5);
    expect(await screen.findByText('Este archivo tiene 5 páginas')).toBeInTheDocument();
    expect(
      screen.queryByText('Analizando tu archivo: contando sus páginas…'),
    ).not.toBeInTheDocument();
  });

  it('con un archivo que alcanza, dice cuánto le quedaría', async () => {
    stubSaldo(8);
    countPdfPages.mockResolvedValue(5);
    const archivo = new File(['contenido'], 'estado.pdf', { type: 'application/pdf' });
    const { container } = renderWithProviders(<PageQuotaNotice selectedFile={archivo} />, {
      usuario: BASIC_USER,
    });

    await waitFor(() => {
      expect(container.textContent).toMatch(/Después de convertirlo te quedarían 3/);
    });
    expect(container.querySelector('.text-destructive')).not.toBeInTheDocument();
  });

  it('con un archivo que no alcanza, avisa en rojo cuánto falta y cómo comprar', async () => {
    stubSaldo(2);
    countPdfPages.mockResolvedValue(5);
    const archivo = new File(['contenido'], 'estado.pdf', { type: 'application/pdf' });
    const { container } = renderWithProviders(<PageQuotaNotice selectedFile={archivo} />, {
      usuario: BASIC_USER,
    });

    await waitFor(() => {
      expect(container.textContent).toMatch(/Te faltan 3/);
    });
    expect(container.querySelector('.text-destructive')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'comprar más páginas' })).toHaveAttribute(
      'href',
      '/saldo',
    );
  });

  it('las páginas compradas cuentan para decidir si alcanza', async () => {
    stubSaldo(2, 40);
    countPdfPages.mockResolvedValue(30);
    const archivo = new File(['contenido'], 'estado.pdf', { type: 'application/pdf' });
    const { container } = renderWithProviders(<PageQuotaNotice selectedFile={archivo} />, {
      usuario: BASIC_USER,
    });

    await waitFor(() => {
      expect(container.textContent).toMatch(/te quedarían 12/);
    });
  });

  it('sin tope fijo (Atlas), no habla de saldo sino de cotizar', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { pagesUsed: 0, monthlyPageQuota: null, unlimited: true, lots: [] }),
        ),
    );
    renderWithProviders(<PageQuotaNotice selectedFile={null} />, { usuario: TEST_USER });

    expect(
      await screen.findByText(/volumen de páginas a cotizar, sin tope fijo/),
    ).toBeInTheDocument();
  });

  it('con la prueba gratuita agotada y sin compras, lo dice y ofrece comprar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          pagesUsed: 3,
          monthlyPageQuota: 3,
          unlimited: false,
          pagesAvailable: 0,
          period: null,
          lots: [lote('TRIAL', 3, 0, { expiresAt: null })],
        }),
      ),
    );
    const plan = BASIC_USER.plan as NonNullable<SessionUser['plan']>;
    const usuarioGratuito: SessionUser = {
      ...BASIC_USER,
      plan: { ...plan, trialOneTime: true, trialAvailable: false },
    };
    renderWithProviders(<PageQuotaNotice selectedFile={null} />, { usuario: usuarioGratuito });

    expect(await screen.findByText('Ya usaste tu prueba gratuita')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'compra más páginas' })).toBeInTheDocument();
  });

  it('sin páginas en el periodo, dice cuándo recibe nuevas', async () => {
    stubSaldo(0);
    const { container } = renderWithProviders(<PageQuotaNotice selectedFile={null} />, {
      usuario: BASIC_USER,
    });

    expect(await screen.findByText('No te quedan páginas')).toBeInTheDocument();
    expect(container.textContent).toMatch(/Tu membresía te da páginas nuevas el/);
  });
});
