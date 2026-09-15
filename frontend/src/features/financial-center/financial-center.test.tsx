import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FinancialCenter } from './financial-center';
import type { FinancialStatement, FinancialTransaction } from './types';

function tx(overrides: Partial<FinancialTransaction>): FinancialTransaction {
  return {
    id: 'tx-1',
    bankId: 'bcp',
    date: '2026-02-01',
    description: 'Transferencia recibida — Cliente corporativo',
    category: 'Transferencias',
    type: 'ABONO',
    amountCents: 10000,
    reconciled: true,
    ...overrides,
  };
}

function statement(overrides: Partial<FinancialStatement>): FinancialStatement {
  return {
    id: 'bcp-2026-02',
    bancoOrigen: 'bcp',
    fechaPeriodo: '2026-02',
    periodoLabel: 'Febrero de 2026',
    saldoInicial: 0,
    abonos: 0,
    cargos: 0,
    saldoFinal: 0,
    movimientos: [],
    ...overrides,
  };
}

// Feb 2026 (el mes más reciente, la vista por defecto) trae 11 movimientos entre
// los dos bancos: suficiente para probar "Cargar más" con PAGE_SIZE = 8.
const FIXTURE_STATEMENTS: FinancialStatement[] = [
  statement({
    id: 'bcp-2026-02',
    bancoOrigen: 'bcp',
    fechaPeriodo: '2026-02',
    saldoInicial: 100000,
    abonos: 85000,
    cargos: 23000,
    saldoFinal: 162000,
    movimientos: [
      tx({ id: 'm1', bankId: 'bcp', date: '2026-02-20', type: 'ABONO', amountCents: 50000 }),
      tx({
        id: 'm2',
        bankId: 'bcp',
        date: '2026-02-18',
        type: 'CARGO',
        amountCents: 10000,
        description: 'Pago SUNAT — Tributos',
        category: 'Impuestos',
      }),
      tx({ id: 'm3', bankId: 'bcp', date: '2026-02-15', type: 'ABONO', amountCents: 20000 }),
      tx({ id: 'm4', bankId: 'bcp', date: '2026-02-12', type: 'CARGO', amountCents: 8000 }),
      tx({ id: 'm5', bankId: 'bcp', date: '2026-02-08', type: 'ABONO', amountCents: 15000 }),
      tx({ id: 'm6', bankId: 'bcp', date: '2026-02-03', type: 'CARGO', amountCents: 5000 }),
    ],
  }),
  statement({
    id: 'bbva-2026-02',
    bancoOrigen: 'bbva',
    fechaPeriodo: '2026-02',
    saldoInicial: 40000,
    abonos: 15000,
    cargos: 19000,
    saldoFinal: 36000,
    movimientos: [
      tx({
        id: 'n1',
        bankId: 'bbva',
        date: '2026-02-19',
        type: 'CARGO',
        amountCents: 12000,
        description: 'Pago de nómina — Planilla mensual',
        category: 'Nómina',
      }),
      tx({ id: 'n2', bankId: 'bbva', date: '2026-02-17', type: 'ABONO', amountCents: 9000 }),
      tx({ id: 'n3', bankId: 'bbva', date: '2026-02-14', type: 'CARGO', amountCents: 3000 }),
      tx({ id: 'n4', bankId: 'bbva', date: '2026-02-11', type: 'ABONO', amountCents: 6000 }),
      tx({ id: 'n5', bankId: 'bbva', date: '2026-02-05', type: 'CARGO', amountCents: 4000 }),
    ],
  }),
  statement({
    id: 'bcp-2026-01',
    bancoOrigen: 'bcp',
    fechaPeriodo: '2026-01',
    periodoLabel: 'Enero de 2026',
    saldoInicial: 80000,
    abonos: 35000,
    cargos: 8000,
    saldoFinal: 107000,
    movimientos: [
      tx({ id: 'j1', bankId: 'bcp', date: '2026-01-25', type: 'ABONO', amountCents: 30000 }),
      tx({ id: 'j2', bankId: 'bcp', date: '2026-01-10', type: 'CARGO', amountCents: 8000 }),
      tx({ id: 'j3', bankId: 'bcp', date: '2026-01-03', type: 'ABONO', amountCents: 5000 }),
    ],
  }),
  statement({
    id: 'bbva-2026-01',
    bancoOrigen: 'bbva',
    fechaPeriodo: '2026-01',
    periodoLabel: 'Enero de 2026',
    saldoInicial: 20000,
    abonos: 10000,
    cargos: 4000,
    saldoFinal: 26000,
    movimientos: [
      tx({ id: 'k1', bankId: 'bbva', date: '2026-01-22', type: 'CARGO', amountCents: 4000 }),
      tx({ id: 'k2', bankId: 'bbva', date: '2026-01-08', type: 'ABONO', amountCents: 10000 }),
    ],
  }),
];

function movementsCard(): HTMLElement {
  const card = screen.getByText('Movimientos').closest('[data-slot="card"]');
  if (!(card instanceof HTMLElement)) {
    throw new Error('No se encontró la tarjeta de movimientos.');
  }
  return card;
}

describe('FinancialCenter', () => {
  it('muestra el flujo neto, la ecuación del periodo, las cuentas y los movimientos', () => {
    render(<FinancialCenter statements={FIXTURE_STATEMENTS} />);

    expect(screen.getByText('Flujo neto del periodo')).toBeInTheDocument();
    expect(screen.getByText('Entradas / Abonos')).toBeInTheDocument();
    expect(screen.getByText('Salidas / Cargos')).toBeInTheDocument();
    expect(screen.getByText('Saldo inicial')).toBeInTheDocument();
    expect(screen.getByText('Saldo final')).toBeInTheDocument();
    expect(screen.getByText('Cuentas consolidadas')).toBeInTheDocument();
    expect(screen.getByText('Movimientos')).toBeInTheDocument();
  });

  it('arranca en el mes más reciente disponible y navega al anterior con el paginador', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter statements={FIXTURE_STATEMENTS} />);

    expect(within(movementsCard()).getAllByRole('listitem')).toHaveLength(8);

    await user.click(screen.getByRole('button', { name: 'Periodo anterior' }));

    // Enero solo trae 5 movimientos entre los dos bancos: por debajo de una página.
    expect(within(movementsCard()).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('combobox', { name: 'Elegir mes y año' })).toHaveValue('2026-01');
  });

  it('filtra por banco al activar un pill, atenuando las cuentas no elegidas', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter statements={FIXTURE_STATEMENTS} />);

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
    const cuentaBbva = within(cuentasCard).getByText('BBVA').closest('li');
    expect(cuentaBbva).not.toBeNull();
    expect(cuentaBbva).toHaveClass('opacity-40');

    expect(within(movementsCard()).queryByTitle('BBVA')).not.toBeInTheDocument();

    await user.click(within(grupoBancos).getByRole('button', { name: 'Todos los bancos' }));
    expect(within(grupoBancos).getByRole('button', { name: 'Todos los bancos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(cuentaBbva).not.toHaveClass('opacity-40');
  });

  it('filtra los movimientos en tiempo real al buscar por descripción', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter statements={FIXTURE_STATEMENTS} />);

    await user.type(screen.getByRole('searchbox', { name: /Buscar movimientos/i }), 'SUNAT');

    expect(within(movementsCard()).getByText(/Coincidencias con "SUNAT"/)).toBeInTheDocument();
    expect(within(movementsCard()).getAllByText(/Pago SUNAT/)).toHaveLength(1);
  });

  it('muestra las primeras filas y permite cargar más sin romper la altura inicial', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter statements={FIXTURE_STATEMENTS} />);

    const card = movementsCard();
    expect(within(card).getAllByRole('listitem')).toHaveLength(8);

    const cargarMas = within(card).getByRole('button', { name: 'Cargar más' });
    await user.click(cargarMas);

    expect(within(card).getAllByRole('listitem')).toHaveLength(11);
    expect(within(card).queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();

    const verMenos = within(card).getByRole('button', { name: 'Ver menos' });
    await user.click(verMenos);

    expect(within(card).getAllByRole('listitem')).toHaveLength(8);
  });

  it('al cambiar de banco, la paginación vuelve a la primera página', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter statements={FIXTURE_STATEMENTS} />);

    const card = movementsCard();
    await user.click(within(card).getByRole('button', { name: 'Cargar más' }));
    expect(within(card).getAllByRole('listitem')).toHaveLength(11);

    const grupoBancos = screen.getByRole('group', { name: 'Filtrar por banco' });
    await user.click(within(grupoBancos).getByRole('button', { name: 'BCP' }));

    // BCP en febrero trae 6 movimientos: menos que una página, ya no cabe "Cargar más".
    expect(within(card).getAllByRole('listitem')).toHaveLength(6);
    expect(within(card).queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });
});
