import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { FinancialStatement, FinancialTransaction } from '@/features/financial-center/types';
import { getMonthLabel } from '@/lib/month';
import { statementFixture, transactionFixture } from '@/test/financial-fixtures';

import { FinancialCalendarView } from './financial-calendar-view';

function tx(
  id: string,
  date: string,
  type: FinancialTransaction['type'],
  amountCents: number,
  description: string,
): FinancialTransaction {
  return transactionFixture({
    id,
    bankId: 'bcp',
    currency: 'PEN',
    date,
    description,
    category: 'Otros movimientos',
    type,
    amountCents,
    reconciled: true,
  });
}

const STATEMENTS: FinancialStatement[] = [
  statementFixture({
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
  }),
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
    // Una vez en los resultados de todos los meses y otra en el detalle del día.
    const results = screen.getByRole('region', { name: 'Resultados en todos los meses' });
    expect(within(results).getByText('YAPE MONICA')).toBeInTheDocument();
    expect(screen.getAllByText('YAPE MONICA')).toHaveLength(2);
    expect(screen.queryByText('PAGO SUNAT')).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('Ningún movimiento del mes coincide.')).toBeInTheDocument();
  });
});

/**
 * Diciembre de 2025 y enero de 2026. El de enero trae un YAPE del 31 de
 * diciembre que el banco procesó tarde: su fecha es de diciembre, su documento
 * es el de enero.
 */
const ACROSS_YEARS: FinancialStatement[] = [
  statementFixture({
    id: 'job-dic',
    fechaPeriodo: '2025-12',
    periodoLabel: 'Diciembre de 2025',
    saldoInicial: 100000,
    abonos: 10000,
    saldoFinal: 110000,
    movimientos: [
      transactionFixture({
        id: 'd1',
        statementId: 'job-dic',
        date: '2025-12-05',
        description: 'YAPE DICIEMBRE',
        amountCents: 10000,
      }),
    ],
  }),
  statementFixture({
    id: 'job-ene',
    fechaPeriodo: '2026-01',
    periodoLabel: 'Enero de 2026',
    saldoInicial: 110000,
    abonos: 7000,
    saldoFinal: 117000,
    movimientos: [
      transactionFixture({
        id: 'e0',
        statementId: 'job-ene',
        date: '2025-12-31',
        description: 'YAPE TARDIO',
        amountCents: 2000,
      }),
      transactionFixture({
        id: 'e1',
        statementId: 'job-ene',
        date: '2026-01-15',
        description: 'YAPE ENERO',
        amountCents: 5000,
      }),
    ],
  }),
];

describe('FinancialCalendarView: búsqueda en todos los meses', () => {
  it('encuentra en otros meses y años, dice de qué documento viene y lleva a su día', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView statements={ACROSS_YEARS} />);
    expect(screen.getByRole('heading', { name: getMonthLabel('2026-01') })).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'yape');
    const results = screen.getByRole('region', { name: 'Resultados en todos los meses' });
    expect(
      within(results).getByText('3 coincidencias en 2 meses. Elige una para ir a su día.'),
    ).toBeInTheDocument();
    expect(within(results).getByText('Diciembre de 2025')).toBeInTheDocument();
    // La fecha es de diciembre; el documento, de enero.
    expect(within(results).getByText('En el estado de cuenta de Ene. 2026')).toBeInTheDocument();

    await user.click(within(results).getByRole('button', { name: /YAPE TARDIO/ }));
    expect(screen.getByRole('heading', { name: getMonthLabel('2025-12') })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /miércoles, 31 de diciembre de 2025/i }),
    ).toBeInTheDocument();
  });

  it('dice cuando nada coincide en ningún mes', async () => {
    const user = userEvent.setup();
    render(<FinancialCalendarView statements={ACROSS_YEARS} />);
    await user.type(screen.getByRole('searchbox'), 'sin coincidencias');
    expect(
      screen.getByText('Nada coincide con «sin coincidencias» en ningún mes.'),
    ).toBeInTheDocument();
  });

  it('una copia exacta del mismo documento no duplica los movimientos', async () => {
    const user = userEvent.setup();
    const copy = { ...ACROSS_YEARS[1], id: 'job-ene-copia' } as FinancialStatement;
    render(<FinancialCalendarView statements={[...ACROSS_YEARS, copy]} />);
    await user.type(screen.getByRole('searchbox'), 'yape');
    expect(
      screen.getByText('3 coincidencias en 2 meses. Elige una para ir a su día.'),
    ).toBeInTheDocument();
  });
});
