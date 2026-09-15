import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FinancialCalendarPage } from './financial-calendar-page';

describe('FinancialCalendarPage', () => {
  it('encabeza la página y monta el calendario financiero', () => {
    render(<FinancialCalendarPage />);

    expect(screen.getByRole('heading', { name: 'Calendario Financiero' })).toBeInTheDocument();
    expect(screen.getByText(/^Balance al /)).toBeInTheDocument();
  });
});
