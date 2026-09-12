import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { LoginPage } from './login-page';

describe('LoginPage', () => {
  it('explica por qué se cerró la sesión cuando hubo un motivo', () => {
    // Tras cambiar la contraseña el servidor cierra todas las sesiones: sin este
    // aviso, volver a la pantalla de entrada parecería un fallo.
    renderWithProviders(<LoginPage />, {
      usuario: null,
      aviso: 'Contraseña cambiada. Entra con la nueva.',
    });

    expect(screen.getByText('Contraseña cambiada. Entra con la nueva.')).toBeInTheDocument();
  });

  it('no muestra aviso en una entrada normal', () => {
    renderWithProviders(<LoginPage />, { usuario: null });

    expect(screen.getByRole('button', { name: 'Acceder' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
