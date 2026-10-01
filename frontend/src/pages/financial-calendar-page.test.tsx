import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { stubApi } from '@/test/financial-api';
import { renderWithProviders, TEST_USER } from '@/test/render';

import { FinancialCalendarPage } from './financial-calendar-page';

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('FinancialCalendarPage', () => {
  it('pinta los documentos del historial, no datos simulados', async () => {
    stubApi();
    renderWithProviders(<FinancialCalendarPage />);

    expect(screen.getByRole('heading', { name: 'Calendario' })).toBeInTheDocument();
    // Abre en el mes del documento.
    expect(await screen.findByRole('heading', { name: 'Setiembre de 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Día 2: 1 movimiento, neto/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Día 5: 1 movimiento, neto/ })).toBeInTheDocument();
    // 1000 de saldo anterior + 500 - 200: el saldo arranca en el que declara el documento.
    expect(screen.getByText(/1,300\.00/)).toBeInTheDocument();
  });

  it('sin documentos marcados, remite al Historial', async () => {
    window.localStorage.setItem(
      `eecc:statements-excluded:${TEST_USER.userId}`,
      JSON.stringify(['job-1']),
    );
    stubApi();
    renderWithProviders(<FinancialCalendarPage />);

    expect(await screen.findByText('No hay documentos marcados para analizar')).toBeInTheDocument();
  });
});
