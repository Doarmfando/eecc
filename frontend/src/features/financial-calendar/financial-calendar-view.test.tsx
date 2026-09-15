import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { MOCK_MONTH_RANGE } from '@/features/financial-center/mock-transactions';
import { daysInMonth, getMonthLabel } from '@/lib/month';

import { FinancialCalendarView } from './financial-calendar-view';

const AVISO_SIN_DIA = 'Elige un día del calendario para ver el detalle de sus movimientos.';

describe('FinancialCalendarView', () => {
  it('muestra el mes, el toggle de vista, el filtro de banco y el resumen del mes', () => {
    render(<FinancialCalendarView />);

    expect(
      screen.getByRole('heading', { name: getMonthLabel(MOCK_MONTH_RANGE.max) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tablist', { name: 'Modo de vista del calendario' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtrar por banco (todos)' })).toBeInTheDocument();
    expect(screen.getByText('Balance al')).toBeInTheDocument();
    expect(screen.getByText('Saldo')).toBeInTheDocument();
    expect(screen.getByText('Entradas')).toBeInTheDocument();
    expect(screen.getByText('Salidas')).toBeInTheDocument();
    expect(screen.getByText(AVISO_SIN_DIA)).toBeInTheDocument();
  });

  it('solo los días del mes son pulsables; los del mes vecino son contexto', () => {
    render(<FinancialCalendarView />);

    expect(screen.getAllByRole('button', { name: /^Día \d+/ })).toHaveLength(
      daysInMonth(MOCK_MONTH_RANGE.max),
    );
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
    // En Balance todo día del mes tiene saldo, tenga o no movimientos.
    for (const day of screen.getAllByRole('button', { name: /^Día \d+/ })) {
      expect(day.getAttribute('aria-label')).toMatch(/saldo/);
    }
  });

  it('al hacer clic en un día con movimientos, abre su detalle; al repetir el clic, lo cierra', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView />);

    const diaConMovimiento = screen
      .getAllByRole('button', { name: /^Día \d+/ })
      .find((button) => /\d+ movimientos?/.test(button.getAttribute('aria-label') ?? ''));
    if (!diaConMovimiento) {
      throw new Error('No se encontró ningún día con movimientos en el mes por defecto.');
    }

    await user.click(diaConMovimiento);
    expect(diaConMovimiento).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(AVISO_SIN_DIA)).not.toBeInTheDocument();

    await user.click(diaConMovimiento);
    expect(diaConMovimiento).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(AVISO_SIN_DIA)).toBeInTheDocument();
  });

  it('filtra por banco desde el menú del embudo y cuenta los bancos elegidos', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView />);

    await user.click(screen.getByRole('button', { name: 'Filtrar por banco (todos)' }));
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
    expect(
      screen.getByRole('button', { name: 'Filtrar por banco (1 seleccionado)' }),
    ).toBeInTheDocument();
  });

  it('despliega entradas y salidas desde el chevron del resumen', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView />);

    const chevron = screen.getByRole('button', { name: 'Ver entradas y salidas' });
    expect(chevron).toHaveAttribute('aria-expanded', 'false');

    await user.click(chevron);
    expect(screen.getByRole('button', { name: 'Ocultar entradas y salidas' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
