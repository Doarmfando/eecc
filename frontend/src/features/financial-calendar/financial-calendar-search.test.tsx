import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { FinancialStatement, FinancialTransaction } from '@/features/financial-center/types';

import { FinancialCalendarView } from './financial-calendar-view';

function tx(
  id: string,
  date: string,
  type: FinancialTransaction['type'],
  amountCents: number,
  description: string,
): FinancialTransaction {
  return {
    id,
    bankId: 'bcp',
    currency: 'PEN',
    date,
    description,
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
    moneda: 'PEN',
    fechaPeriodo: '2026-08',
    periodoLabel: 'Agosto de 2026',
    saldoInicial: 100000,
    abonos: 50000,
    cargos: 32000,
    saldoFinal: 118000,
    movimientos: [
      tx('a', '2026-08-03', 'ABONO', 50000, 'DEPOSITO NOMINA'),
      tx('b', '2026-08-10', 'CARGO', 20000, 'PAGO SUNAT'),
      tx('c', '2026-08-10', 'CARGO', 12000, 'YAPE MONICA'),
    ],
  },
];

function day(number: number): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^Día ${String(number)}:`) });
}

describe('FinancialCalendarView: buscador', () => {
  it('pinta en Flujo solo lo encontrado, atenúa los demás días y dice cuánto suma', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView statements={STATEMENTS} />);

    // Sin búsqueda, el 10 suma los dos cargos y el negativo va en rojo suave.
    expect(within(day(10)).getByText('−S/ 320.00')).toHaveClass('hidden');
    expect(within(day(10)).getByText('−320.00').parentElement).toHaveClass('text-destructive/75');

    await user.type(screen.getByRole('searchbox'), 'sunat');

    expect(screen.getByText('1 movimiento coincide · neto −S/ 200.00')).toBeInTheDocument();
    expect(within(day(10)).getByText('−S/ 200.00')).toBeInTheDocument();
    expect(day(3)).toHaveClass('opacity-35');
    expect(day(10)).not.toHaveClass('opacity-35');
    // El resumen del mes sigue siendo el de las cuentas, no el de la búsqueda.
    expect(screen.getByText('S/ 1,180.00')).toBeInTheDocument();
  });

  it('filtra el detalle del día y avisa cuando nada coincide', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView statements={STATEMENTS} />);

    await user.type(screen.getByRole('searchbox'), 'yape');
    await user.click(day(10));
    expect(screen.getByText('YAPE MONICA')).toBeInTheDocument();
    expect(screen.queryByText('PAGO SUNAT')).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('Ningún movimiento del mes coincide.')).toBeInTheDocument();
  });
});
