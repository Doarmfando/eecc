import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { FinancialStatement, FinancialTransaction } from '@/features/financial-center/types';
import { daysInMonth, getMonthLabel } from '@/lib/month';

import { FinancialCalendarView } from './financial-calendar-view';

function tx(
  id: string,
  bankId: FinancialTransaction['bankId'],
  date: string,
  type: FinancialTransaction['type'],
  amountCents: number,
): FinancialTransaction {
  return {
    id,
    bankId,
    date,
    description: `Movimiento ${id}`,
    category: 'Otros movimientos',
    type,
    amountCents,
    reconciled: true,
  };
}

const STATEMENTS: FinancialStatement[] = [
  {
    id: 'job-bcp',
    bancoOrigen: 'bcp',
    fechaPeriodo: '2026-08',
    periodoLabel: 'Agosto de 2026',
    saldoInicial: 100000,
    abonos: 50000,
    cargos: 20000,
    saldoFinal: 130000,
    movimientos: [
      tx('bcp-1', 'bcp', '2026-08-03', 'ABONO', 50000),
      tx('bcp-2', 'bcp', '2026-08-10', 'CARGO', 20000),
    ],
  },
  {
    id: 'job-ibk',
    bancoOrigen: 'interbank',
    fechaPeriodo: '2026-08',
    periodoLabel: 'Agosto de 2026',
    saldoInicial: 4661,
    abonos: 0,
    cargos: 4240,
    saldoFinal: 421,
    movimientos: [tx('ibk-1', 'interbank', '2026-08-31', 'CARGO', 4240)],
  },
];

const LAST_MONTH = '2026-08';

const AVISO_SIN_DIA = 'Elige un día del calendario para ver el detalle de sus movimientos.';

describe('FinancialCalendarView', () => {
  it('muestra el mes, el toggle de vista, el filtro de banco y el resumen del mes', () => {
    render(<FinancialCalendarView statements={STATEMENTS} />);

    expect(screen.getByRole('heading', { name: getMonthLabel(LAST_MONTH) })).toBeInTheDocument();
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
    render(<FinancialCalendarView statements={STATEMENTS} />);

    expect(screen.getAllByRole('button', { name: /^Día \d+/ })).toHaveLength(
      daysInMonth(LAST_MONTH),
    );
  });

  it('alterna entre el modo Balance y Flujo', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView statements={STATEMENTS} />);

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
    render(<FinancialCalendarView statements={STATEMENTS} />);

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
    render(<FinancialCalendarView statements={STATEMENTS} />);

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
    render(<FinancialCalendarView statements={STATEMENTS} />);

    const chevron = screen.getByRole('button', { name: 'Ver entradas y salidas' });
    expect(chevron).toHaveAttribute('aria-expanded', 'false');

    await user.click(chevron);
    expect(screen.getByRole('button', { name: 'Ocultar entradas y salidas' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('pinta en la celda el importe con sus dos decimales', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView statements={STATEMENTS} />);

    // Neto del 31: un cargo de 42.40, sin redondear a soles enteros.
    expect(
      within(screen.getByRole('button', { name: /^Día 31:/ })).getByText('−42.40'),
    ).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Balance' }));
    expect(
      within(screen.getByRole('button', { name: /^Día 31:/ })).getByText('1,304.21'),
    ).toBeInTheDocument();
  });

  it('arranca el saldo en el inicial que declara cada documento y lo arrastra', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView statements={STATEMENTS} />);

    await user.click(screen.getByRole('tab', { name: 'Balance' }));
    // Día 1: 1000.00 + 46.61, sin movimientos todavía.
    expect(screen.getByRole('button', { name: /^Día 1: sin movimientos/ })).toHaveAccessibleName(
      /1,046\.61/,
    );
    // Cierre: 1300.00 + 4.21, lo mismo que suman los saldos finales declarados.
    expect(screen.getByRole('button', { name: /^Día 31:/ })).toHaveAccessibleName(/1,304\.21/);
  });
});
