import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { statementFixture, transactionFixture } from '@/test/financial-fixtures';

import { FinancialCenter } from './financial-center';
import type { FinancialStatement, StatementAccount } from './types';

const BCP: StatementAccount = { clave: 'aaaaaaaa', terminacion: '1111' };
const IBK: StatementAccount = { clave: 'bbbbbbbb', terminacion: '2222' };

/** Un mes de una cuenta: un YAPE de entrada y un pago de salida. Cifras inventadas. */
function month(
  id: string,
  bank: 'bcp' | 'interbank',
  fechaPeriodo: string,
  saldoInicial: number,
): FinancialStatement {
  const abono = 30000;
  const cargo = 10000;
  return statementFixture({
    id,
    nombreDocumento: `${id}.pdf`,
    bancoOrigen: bank,
    cuenta: bank === 'bcp' ? BCP : IBK,
    fechaPeriodo,
    saldoInicial,
    abonos: abono,
    cargos: cargo,
    saldoFinal: saldoInicial + abono - cargo,
    movimientos: [
      transactionFixture({
        id: `${id}-0`,
        statementId: id,
        bankId: bank,
        date: `${fechaPeriodo}-05`,
        description: `YAPE ${id}`,
        type: 'ABONO',
        amountCents: abono,
        balanceCents: saldoInicial + abono,
        source: { page: 1, row: 1 },
      }),
      transactionFixture({
        id: `${id}-1`,
        statementId: id,
        bankId: bank,
        date: `${fechaPeriodo}-20`,
        description: `PAGO ${id}`,
        type: 'CARGO',
        amountCents: cargo,
        balanceCents: saldoInicial + abono - cargo,
        source: { page: 1, row: 2 },
      }),
    ],
  });
}

/** Dos cuentas con enero y febrero completos: sus cadenas cierran. */
const CONTINUOUS = [
  month('bcp-ene', 'bcp', '2026-01', 100000),
  month('bcp-feb', 'bcp', '2026-02', 120000),
  month('ibk-ene', 'interbank', '2026-01', 50000),
  month('ibk-feb', 'interbank', '2026-02', 70000),
];

function pressed(name: string): string | null {
  return screen.getByRole('button', { name }).getAttribute('aria-pressed');
}

function bodyRows(): HTMLElement[] {
  const [table] = screen.getAllByRole('table');
  const body = within(table as HTMLElement).getAllByRole('rowgroup')[1] as HTMLElement;
  return within(body).getAllByRole('row');
}

describe('FinancialCenter: visualización y alcance', () => {
  it('arranca en Panel y Periodo, con la vista de siempre', () => {
    render(<FinancialCenter statements={CONTINUOUS} />);
    expect(pressed('Panel')).toBe('true');
    expect(pressed('Periodo')).toBe('true');
    expect(screen.getByText('Flujo neto del periodo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Elegir periodo/ })).toBeInTheDocument();
  });

  it('Panel acumulado: busca en todos los periodos y dice de qué periodo es cada fila', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter statements={CONTINUOUS} />);
    await user.click(screen.getByRole('button', { name: 'Acumulado' }));
    expect(screen.getByText('Todos los periodos')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'yape');
    expect(screen.getByText('YAPE bcp-ene')).toBeInTheDocument();
    expect(screen.getByText('YAPE bcp-feb')).toBeInTheDocument();
    expect(screen.getAllByText(/EECC Ene\. 2026/).length).toBeGreaterThan(0);
    expect(screen.queryByText('PAGO bcp-ene')).not.toBeInTheDocument();
  });

  it('Panel acumulado: entradas y salidas acumuladas; saldo por cuenta de punta a punta', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter statements={CONTINUOUS} />);
    await user.click(screen.getByRole('button', { name: 'Acumulado' }));

    expect(screen.getByText('S/ 1,200.00')).toBeInTheDocument(); // 4 × 300 de entradas
    expect(screen.getByText('S/ 400.00')).toBeInTheDocument(); // 4 × 100 de salidas
    expect(screen.getByText('BCP ···1111')).toBeInTheDocument();
    expect(screen.getByText('Interbank ···2222')).toBeInTheDocument();
    // 1,400 (BCP) + 900 (Interbank): los últimos saldos, no la suma de los cuatro meses.
    expect(screen.getByText(/Saldo consolidado al cierre de Febrero de 2026/)).toBeInTheDocument();
    expect(screen.getByText('S/ 2,300.00')).toBeInTheDocument();
  });

  it('Panel acumulado: con un mes faltante no presenta un saldo global', async () => {
    const user = userEvent.setup();
    render(
      <FinancialCenter
        statements={[
          month('bcp-ene', 'bcp', '2026-01', 100000),
          month('bcp-mar', 'bcp', '2026-03', 140000),
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Acumulado' }));
    expect(screen.getByText('Sin saldo global conciliado.')).toBeInTheDocument();
    expect(screen.getByText('Con saltos')).toBeInTheDocument();
    expect(screen.getByText(/falta Febrero de 2026/)).toBeInTheDocument();
  });

  it('Tabla normal: solo las filas del periodo elegido, con totales', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter statements={CONTINUOUS} />);
    await user.click(screen.getByRole('button', { name: 'Tabla' }));

    expect(bodyRows()).toHaveLength(4);
    expect(screen.queryByText('YAPE bcp-ene')).not.toBeInTheDocument();
    expect(screen.getByText('Total · 4 movimientos')).toBeInTheDocument();
  });

  it('Tabla acumulada: anexa todos los documentos y busca en todos los periodos', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter statements={CONTINUOUS} />);
    await user.click(screen.getByRole('button', { name: 'Tabla' }));
    await user.click(screen.getByRole('button', { name: 'Acumulado' }));
    expect(bodyRows()).toHaveLength(8);

    await user.type(screen.getByRole('searchbox'), 'YAPE');
    expect(bodyRows()).toHaveLength(4);
    expect(screen.getByText('Total · 4 movimientos')).toBeInTheDocument();
    // Cada fila dice su documento de origen y dónde está en él.
    expect(screen.getByText('bcp-ene.pdf')).toBeInTheDocument();
    expect(screen.getAllByText(/pág\. 1 · fila 1/)).toHaveLength(4);
  });

  it('Tabla: ordena por columna y filtra por cuenta y periodo', async () => {
    const user = userEvent.setup();
    render(<FinancialCenter statements={CONTINUOUS} />);
    await user.click(screen.getByRole('button', { name: 'Tabla' }));
    await user.click(screen.getByRole('button', { name: 'Acumulado' }));

    await user.click(screen.getByRole('button', { name: /^Saldo/ }));
    const header = screen.getByRole('columnheader', { name: /^Saldo/ });
    expect(header).toHaveAttribute('aria-sort', 'descending');
    // El saldo impreso más alto: BCP febrero tras el abono, 1,500.00.
    expect(within(bodyRows()[0] as HTMLElement).getByText('S/ 1,500.00')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cuenta' }), 'Interbank ···2222');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Periodo' }), 'Enero de 2026');
    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByText('YAPE ibk-ene')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(bodyRows()).toHaveLength(8);
  });

  it('Tabla: pagina de a 50 filas', async () => {
    const user = userEvent.setup();
    const many = statementFixture({
      id: 'grande',
      cuenta: BCP,
      fechaPeriodo: '2026-01',
      movimientos: Array.from({ length: 60 }, (_, index) =>
        transactionFixture({
          id: `g-${String(index)}`,
          statementId: 'grande',
          date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
          description: `Movimiento ${String(index)}`,
          source: { page: 1, row: index + 1 },
        }),
      ),
    });
    render(<FinancialCenter statements={[many]} />);
    await user.click(screen.getByRole('button', { name: 'Tabla' }));
    expect(bodyRows()).toHaveLength(50);
    expect(screen.getByText('Filas 1–50 de 60')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText('Filas 51–60 de 60')).toBeInTheDocument();
  });

  it('Tabla: señala la fila inconsistente y el documento en revisión', async () => {
    const user = userEvent.setup();
    const [base] = CONTINUOUS as [FinancialStatement];
    const flagged: FinancialStatement = {
      ...base,
      estado: 'NEEDS_REVIEW',
      movimientos: base.movimientos.map((movement, index) =>
        index === 0 ? { ...movement, issues: ['SIGNO_INCONSISTENTE'] } : movement,
      ),
    };
    render(<FinancialCenter statements={[flagged]} />);
    await user.click(screen.getByRole('button', { name: 'Tabla' }));
    expect(
      screen.getByText(
        'El importe con signo no coincide con las columnas Cargo y Abono. Su documento quedó en «Requiere revisión»',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/quedó en «Requiere revisión»: sus totales/)).toBeInTheDocument();
  });

  it('un documento repetido se cuenta una sola vez y se avisa', async () => {
    const user = userEvent.setup();
    const [original] = CONTINUOUS as [FinancialStatement];
    const copy = { ...original, id: 'bcp-ene-copia', nombreDocumento: 'copia.pdf' };
    render(<FinancialCenter statements={[original, copy]} />);
    expect(screen.getByText('Un documento repetido se cuenta una sola vez')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tabla' }));
    expect(bodyRows()).toHaveLength(2);
  });
});
