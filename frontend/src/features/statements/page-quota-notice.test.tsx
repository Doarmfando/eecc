import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

function stubUsage(pagesUsed: number, monthlyPageQuota: number | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse(200, { pagesUsed, monthlyPageQuota })),
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

  it('dice cuánto lleva del acumulado del mes', async () => {
    stubUsage(7, 10);
    const { container } = renderWithProviders(<PageQuotaNotice selectedFile={null} />, {
      usuario: BASIC_USER,
    });

    await waitFor(() => {
      expect(container.textContent).toMatch(/llevas 7 de 10 páginas acumuladas este mes/);
    });
  });

  it('con un archivo elegido que no se pasaría del cupo, dice cuánto quedaría', async () => {
    stubUsage(2, 10);
    countPdfPages.mockResolvedValue(5);
    const archivo = new File(['contenido'], 'estado.pdf', { type: 'application/pdf' });
    const { container } = renderWithProviders(<PageQuotaNotice selectedFile={archivo} />, {
      usuario: BASIC_USER,
    });

    await waitFor(() => {
      expect(container.textContent).toMatch(/te quedarían 3 este mes/);
    });
    expect(container.querySelector('.text-destructive')).not.toBeInTheDocument();
  });

  it('con un archivo que se pasaría del cupo, avisa en rojo por cuánto', async () => {
    stubUsage(8, 10);
    countPdfPages.mockResolvedValue(5);
    const archivo = new File(['contenido'], 'estado.pdf', { type: 'application/pdf' });
    const { container } = renderWithProviders(<PageQuotaNotice selectedFile={archivo} />, {
      usuario: BASIC_USER,
    });

    await waitFor(() => {
      expect(container.textContent).toMatch(/te pasarías del cupo por 3/);
    });
    expect(container.querySelector('.text-destructive')).toBeInTheDocument();
  });

  it('sin tope fijo (Atlas), no habla de acumulado sino de cotizar', async () => {
    stubUsage(0, null);
    renderWithProviders(<PageQuotaNotice selectedFile={null} />, { usuario: TEST_USER });

    expect(
      await screen.findByText(/volumen de páginas a cotizar, sin tope fijo/),
    ).toBeInTheDocument();
  });

  it('con la prueba única ya gastada, avisa sin preguntar el acumulado', () => {
    const usuarioSinPrueba = {
      ...BASIC_USER,
      plan: {
        ...BASIC_USER.plan!,
        trialOneTime: true,
        trialAvailable: false,
      },
    };
    renderWithProviders(<PageQuotaNotice selectedFile={null} />, { usuario: usuarioSinPrueba });

    expect(screen.getByText('Ya usaste tu prueba gratuita')).toBeInTheDocument();
  });
});
