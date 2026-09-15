import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FinancialCenter } from './financial-center';

function movementsCard(): HTMLElement {
  const card = screen.getByText('Movimientos').closest('[data-slot="card"]');
  if (!(card instanceof HTMLElement)) {
    throw new Error('No se encontró la tarjeta de movimientos.');
  }
  return card;
}

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

    expect(within(movementsCard()).queryByTitle('Interbank')).not.toBeInTheDocument();

    await user.click(within(grupoBancos).getByRole('button', { name: 'Todos los bancos' }));
    expect(within(grupoBancos).getByRole('button', { name: 'Todos los bancos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(cuentaInterbank).not.toHaveClass('opacity-40');
  });

  it('filtra los movimientos en tiempo real al buscar por descripción', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter />);

    await user.type(screen.getByRole('searchbox', { name: /Buscar movimientos/i }), 'SUNAT');

    expect(within(movementsCard()).getByText(/Coincidencias con "SUNAT"/)).toBeInTheDocument();
    const filas = within(movementsCard()).getAllByText(/Pago SUNAT/);
    expect(filas.length).toBeGreaterThan(0);
  });

  it('muestra las primeras filas y permite cargar más sin romper la altura inicial', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter />);

    const card = movementsCard();
    expect(within(card).getAllByRole('listitem')).toHaveLength(15);

    const cargarMas = within(card).getByRole('button', { name: 'Cargar más' });
    await user.click(cargarMas);

    expect(within(card).getAllByRole('listitem')).toHaveLength(30);

    const verMenos = within(card).getByRole('button', { name: 'Ver menos' });
    await user.click(verMenos);

    expect(within(card).getAllByRole('listitem')).toHaveLength(15);
    expect(within(card).queryByRole('button', { name: 'Ver menos' })).not.toBeInTheDocument();
  });

  it('al cambiar de banco, la paginación vuelve a la primera página', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter />);

    const card = movementsCard();
    await user.click(within(card).getByRole('button', { name: 'Cargar más' }));
    expect(within(card).getAllByRole('listitem')).toHaveLength(30);

    const grupoBancos = screen.getByRole('group', { name: 'Filtrar por banco' });
    await user.click(within(grupoBancos).getByRole('button', { name: 'BCP' }));

    expect(within(card).getAllByRole('listitem').length).toBeLessThanOrEqual(15);
  });
});
