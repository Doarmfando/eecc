import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JOB_LIST, jsonResponse, stubApi } from '@/test/financial-api';
import { renderWithProviders, TEST_USER } from '@/test/render';

import { FinancialCenterPage } from './financial-center-page';

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('FinancialCenterPage', () => {
  it('consolida directamente los documentos marcados, leyendo sus CSV publicados', async () => {
    stubApi();
    renderWithProviders(<FinancialCenterPage />);

    expect(screen.getByRole('heading', { name: 'Centro Financiero' })).toBeInTheDocument();
    expect(await screen.findByText('Flujo neto del periodo')).toBeInTheDocument();
    // Los movimientos salen del CSV, no de datos simulados.
    expect(screen.getByText('Deposito de la prueba')).toBeInTheDocument();
    expect(screen.getByText('Pago de la prueba')).toBeInTheDocument();
    // La selección ya no se pide aquí: vive en el Historial.
    expect(
      screen.queryByRole('heading', { name: 'Elige los estados de cuenta a analizar' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Elegir documentos en el Historial' })).toHaveAttribute(
      'href',
      '/historial',
    );
  });

  it('sin documentos procesados, invita a subir uno en vez de mostrar datos', async () => {
    stubApi({ items: [], nextCursor: null });
    renderWithProviders(<FinancialCenterPage />);

    expect(
      await screen.findByText(/Todavía no tienes documentos que consolidar/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Subir un estado de cuenta' })).toBeInTheDocument();
  });

  it('si se desmarcaron todos en el Historial, lo dice y lleva allí', async () => {
    window.localStorage.setItem(
      `eecc:statements-excluded:${TEST_USER.userId}`,
      JSON.stringify(['job-1']),
    );
    stubApi();
    renderWithProviders(<FinancialCenterPage />);

    expect(await screen.findByText('No hay documentos marcados para analizar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al Historial' })).toHaveAttribute(
      'href',
      '/historial',
    );
  });

  it('avisa cuando un documento del consolidado no se pudo leer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        if (/\/v1\/jobs\/job-1$/.test(input)) {
          return Promise.resolve(
            new Response(JSON.stringify({ code: 'JOB_NOT_FOUND' }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(jsonResponse(JOB_LIST));
      }),
    );
    renderWithProviders(<FinancialCenterPage />);

    expect(await screen.findByText(/No se pudieron leer todos los documentos/)).toBeInTheDocument();
  });
});
