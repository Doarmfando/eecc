import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FinancialCenter } from './financial-center';

describe('FinancialCenter', () => {
  it('muestra el flujo neto, las cuentas consolidadas y los movimientos', () => {
    render(<FinancialCenter />);

    expect(screen.getByText('Flujo neto consolidado')).toBeInTheDocument();
    expect(screen.getByText('Entradas / Abonos')).toBeInTheDocument();
    expect(screen.getByText('Salidas / Cargos')).toBeInTheDocument();
    expect(screen.getByText('Cuentas consolidadas')).toBeInTheDocument();
    expect(screen.getByText('Movimientos')).toBeInTheDocument();
  });

  it('filtra por banco al activar un pill, atenuando las cuentas no elegidas', async () => {
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

    const cuentasCard = screen.getByText('Cuentas consolidadas').closest('[data-slot="card"]');
    if (!(cuentasCard instanceof HTMLElement)) {
      throw new Error('No se encontró la tarjeta de cuentas consolidadas.');
    }
    const cuentaInterbank = within(cuentasCard).getByText('Interbank').closest('li');
    expect(cuentaInterbank).not.toBeNull();
    expect(cuentaInterbank).toHaveClass('opacity-40');

    const movimientosCard = screen.getByText('Movimientos').closest('[data-slot="card"]');
    if (!(movimientosCard instanceof HTMLElement)) {
      throw new Error('No se encontró la tarjeta de movimientos.');
    }
    expect(within(movimientosCard).queryByTitle('Interbank')).not.toBeInTheDocument();

    await user.click(within(grupoBancos).getByRole('button', { name: 'Todos los bancos' }));
    expect(within(grupoBancos).getByRole('button', { name: 'Todos los bancos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(cuentaInterbank).not.toHaveClass('opacity-40');
  });
});
