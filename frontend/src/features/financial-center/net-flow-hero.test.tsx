import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NetFlowHero } from './net-flow-hero';
import type { PeriodSummary } from './use-financial-center';

function summary(overrides: Partial<PeriodSummary>): PeriodSummary {
  return {
    saldoInicial: 100000,
    abonos: 50000,
    cargos: 20000,
    saldoFinal: 130000,
    movementCount: 5,
    reconciledCount: 5,
    ...overrides,
  };
}

const NOOP = (): void => {
  /* no-op */
};

describe('NetFlowHero', () => {
  it('destaca el flujo neto positivo con el signo +', () => {
    render(
      <NetFlowHero
        summary={summary({ abonos: 50000, cargos: 20000 })}
        calendarMonth="2026-02"
        availableMonths={['2026-01', '2026-02']}
        onGoToMonth={NOOP}
        onPreviousMonth={NOOP}
        onNextMonth={NOOP}
        canGoPreviousMonth
        canGoNextMonth={false}
      />,
    );
    expect(screen.getByText(/^\+\s*S\//)).toBeInTheDocument();
  });

  it('destaca el flujo neto negativo cuando se gastó más de lo que entró', () => {
    render(
      <NetFlowHero
        summary={summary({ abonos: 20000, cargos: 50000 })}
        calendarMonth="2026-02"
        availableMonths={['2026-01', '2026-02']}
        onGoToMonth={NOOP}
        onPreviousMonth={NOOP}
        onNextMonth={NOOP}
        canGoPreviousMonth
        canGoNextMonth={false}
      />,
    );
    expect(screen.getByText(/^−\s*S\//)).toBeInTheDocument();
  });

  it('muestra la ecuación de saldo inicial, entradas, salidas y saldo final', () => {
    render(
      <NetFlowHero
        summary={summary({
          saldoInicial: 100000,
          abonos: 50000,
          cargos: 20000,
          saldoFinal: 130000,
        })}
        calendarMonth="2026-02"
        availableMonths={['2026-01', '2026-02']}
        onGoToMonth={NOOP}
        onPreviousMonth={NOOP}
        onNextMonth={NOOP}
        canGoPreviousMonth
        canGoNextMonth={false}
      />,
    );
    expect(screen.getByText('Saldo inicial')).toBeInTheDocument();
    expect(screen.getByText('Saldo final')).toBeInTheDocument();
  });
});
