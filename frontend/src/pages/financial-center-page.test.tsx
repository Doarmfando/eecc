import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinancialCenterPage } from './financial-center-page';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FinancialCenterPage', () => {
  it('encabeza la página y arranca en la preselección de estados de cuenta', () => {
    render(<FinancialCenterPage />);

    expect(screen.getByRole('heading', { name: 'Centro Financiero' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Elige los estados de cuenta a analizar' }),
    ).toBeInTheDocument();
  });

  it('al confirmar, muestra un estado de carga y luego el Centro Financiero', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FinancialCenterPage />);

    await user.click(screen.getByRole('button', { name: 'Consolidar y analizar' }));

    expect(screen.getByRole('status')).toHaveTextContent('Consolidando tus estados de cuenta');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });

    expect(screen.getByText('Flujo neto del periodo')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
