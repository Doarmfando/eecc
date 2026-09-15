import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StatementSelector } from './statement-selector';
import type { FinancialStatement } from './types';

const STATEMENTS: FinancialStatement[] = [
  {
    id: 'bcp-2026-09',
    bancoOrigen: 'bcp',
    fechaPeriodo: '2026-09',
    periodoLabel: 'Setiembre de 2026',
    saldoInicial: 100000,
    abonos: 50000,
    cargos: 20000,
    saldoFinal: 130000,
    movimientos: [],
  },
  {
    id: 'interbank-2026-08',
    bancoOrigen: 'interbank',
    fechaPeriodo: '2026-08',
    periodoLabel: 'Agosto de 2026',
    saldoInicial: 40000,
    abonos: 10000,
    cargos: 5000,
    saldoFinal: 45000,
    movimientos: [],
  },
];

describe('StatementSelector', () => {
  it('lista los EECC con todos preseleccionados', () => {
    render(<StatementSelector statements={STATEMENTS} onConfirm={vi.fn()} />);

    expect(screen.getByText(/BCP — Setiembre de 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Interbank — Agosto de 2026/)).toBeInTheDocument();
    expect(screen.getByText('2 de 2 seleccionados')).toBeInTheDocument();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeChecked();
    }
  });

  it('deja destildar uno y lo refleja en el contador', async () => {
    const user = userEvent.setup();
    render(<StatementSelector statements={STATEMENTS} onConfirm={vi.fn()} />);

    await user.click(screen.getAllByRole('checkbox')[0]!);

    expect(screen.getByText('1 de 2 seleccionados')).toBeInTheDocument();
  });

  it('deshabilita "Consolidar y analizar" si no queda nada marcado', async () => {
    const user = userEvent.setup();
    render(<StatementSelector statements={STATEMENTS} onConfirm={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Quitar todos' }));

    expect(screen.getByRole('button', { name: 'Consolidar y analizar' })).toBeDisabled();
  });

  it('entrega los ids seleccionados al confirmar', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<StatementSelector statements={STATEMENTS} onConfirm={onConfirm} />);

    await user.click(screen.getAllByRole('checkbox')[1]!);
    await user.click(screen.getByRole('button', { name: 'Consolidar y analizar' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toEqual(new Set(['bcp-2026-09']));
  });
});
