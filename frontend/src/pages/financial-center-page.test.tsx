import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FinancialCenterPage } from './financial-center-page';

describe('FinancialCenterPage', () => {
  it('encabeza la página y monta el Centro Financiero', () => {
    render(<FinancialCenterPage />);

    expect(screen.getByRole('heading', { name: 'Centro Financiero' })).toBeInTheDocument();
    expect(screen.getByText('Flujo neto consolidado')).toBeInTheDocument();
  });
});
