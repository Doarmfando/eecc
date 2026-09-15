import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FinancialCenter } from './financial-center';

describe('FinancialCenter', () => {
  it('muestra los indicadores clave con la data mockeada', () => {
    render(<FinancialCenter />);

    expect(screen.getByText('Flujo total procesado')).toBeInTheDocument();
    expect(screen.getByText('Movimientos reconciliados')).toBeInTheDocument();
    expect(screen.getByText('Saldo global consolidado')).toBeInTheDocument();
    expect(screen.getByText('Tasa de precisión')).toBeInTheDocument();
  });

  function movimientosRecientesCard(): HTMLElement {
    const card = screen.getByText('Patrones y movimientos recientes').closest('[data-slot="card"]');
    if (!(card instanceof HTMLElement)) {
      throw new Error('No se encontró la tarjeta de movimientos recientes.');
    }
    return card;
  }

  it('filtra los movimientos recientes al buscar por descripción', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter />);

    await user.type(screen.getByRole('searchbox', { name: /Buscar movimientos/i }), 'SUNAT');

    expect(screen.getByText(/Coincidencias con "SUNAT"/)).toBeInTheDocument();
    const filas = within(movimientosRecientesCard()).getAllByText(/Pago SUNAT/);
    expect(filas.length).toBeGreaterThan(0);
  });

  it('filtra por banco al activar un pill', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter />);

    const grupoBancos = screen.getByRole('group', { name: 'Filtrar por banco' });
    await user.click(within(grupoBancos).getByRole('button', { name: 'BCP' }));

    expect(within(grupoBancos).getByRole('button', { name: 'BCP' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(grupoBancos).getByRole('button', { name: 'Todos los bancos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    expect(within(movimientosRecientesCard()).queryByText('Interbank')).not.toBeInTheDocument();

    await user.click(within(grupoBancos).getByRole('button', { name: 'Todos los bancos' }));
    expect(within(grupoBancos).getByRole('button', { name: 'Todos los bancos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
