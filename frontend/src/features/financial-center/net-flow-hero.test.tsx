import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NetFlowHero } from './net-flow-hero';
import type { FlowTotals } from './use-financial-center';

function totals(overrides: Partial<FlowTotals>): FlowTotals {
  return {
    incomeCents: 50000,
    expenseCents: 20000,
    netCents: 30000,
    movementCount: 5,
    reconciledCount: 5,
    ...overrides,
  };
}

describe('NetFlowHero', () => {
  it('destaca el flujo neto positivo con el signo +', () => {
    render(<NetFlowHero totals={totals({ netCents: 30000 })} />);
    expect(screen.getByText(/^\+/)).toBeInTheDocument();
  });

  it('destaca el flujo neto negativo cuando se gastó más de lo que entró', () => {
    render(
      <NetFlowHero
        totals={totals({ incomeCents: 20000, expenseCents: 50000, netCents: -30000 })}
      />,
    );
    expect(screen.getByText(/^−/)).toBeInTheDocument();
  });
});
