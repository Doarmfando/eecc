import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FinancialCalendarView } from './financial-calendar-view';

describe('FinancialCalendarView', () => {
  it('muestra el toggle de vista, el filtro de banco y las métricas del mes', () => {
    render(<FinancialCalendarView />);

    expect(
      screen.getByRole('tablist', { name: 'Modo de vista del calendario' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filtrar por banco' })).toBeInTheDocument();
    expect(screen.getByText(/^Balance al /)).toBeInTheDocument();
    expect(screen.getByText('Total entradas')).toBeInTheDocument();
    expect(screen.getByText('Total salidas')).toBeInTheDocument();
    expect(
      screen.getByText('Elige un día del calendario para ver el detalle de sus movimientos.'),
    ).toBeInTheDocument();
  });

  it('alterna entre el modo Balance y Flujo', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView />);

    const flujoTab = screen.getByRole('tab', { name: 'Flujo' });
    const balanceTab = screen.getByRole('tab', { name: 'Balance' });
    expect(flujoTab).toHaveAttribute('aria-selected', 'true');

    await user.click(balanceTab);
    expect(balanceTab).toHaveAttribute('aria-selected', 'true');
    expect(flujoTab).toHaveAttribute('aria-selected', 'false');
  });

  it('al hacer clic en un día con movimientos, abre su detalle; al repetir el clic, lo cierra', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView />);

    const diaConMovimiento = screen
      .getAllByRole('button')
      .find((button) => /movimiento\(s\)/.test(button.getAttribute('aria-label') ?? ''));
    if (!diaConMovimiento) {
      throw new Error('No se encontró ningún día con movimientos en el mes por defecto.');
    }

    await user.click(diaConMovimiento);
    expect(diaConMovimiento).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.queryByText('Elige un día del calendario para ver el detalle de sus movimientos.'),
    ).not.toBeInTheDocument();

    await user.click(diaConMovimiento);
    expect(diaConMovimiento).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByText('Elige un día del calendario para ver el detalle de sus movimientos.'),
    ).toBeInTheDocument();
  });

  it('filtra por banco con los pills compartidos del Centro Financiero', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView />);

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
  });
});
