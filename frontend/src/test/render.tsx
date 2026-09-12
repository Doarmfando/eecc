import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { createQueryClient } from '@/app/query-client';
import { SessionContext, type SessionValue } from '@/app/session-context';
import type { SessionUser } from '@/lib/session-client';

export const TEST_BASE_URL = 'http://127.0.0.1:3000';

export const TEST_USER: SessionUser = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'persona@empresa.pe',
  displayName: 'Persona de prueba',
  organizationId: '22222222-2222-4222-8222-222222222222',
  organizationName: 'Organización de prueba',
  role: 'ADMIN',
  retainedStatementsPerUser: 3,
  allowedEmailDomains: ['hotmail.com', 'empresa.pe', 'eecc.local'],
};

/** Envuelve con los mismos proveedores que la aplicación real. */
export function renderWithProviders(
  ui: ReactElement,
  {
    usuario = TEST_USER,
    cerrar = () => Promise.resolve(),
    aviso = null,
  }: {
    usuario?: SessionUser | null;
    cerrar?: SessionValue['cerrar'];
    aviso?: string | null;
  } = {},
): RenderResult {
  const value: SessionValue = {
    baseUrl: TEST_BASE_URL,
    estado: usuario ? 'autenticado' : 'anonimo',
    usuario,
    establecer: () => undefined,
    cerrar,
    aviso,
    puedeAdministrar: usuario?.role === 'ADMIN',
  };

  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={createQueryClient()}>
        <SessionContext value={value}>
          <MemoryRouter>{children}</MemoryRouter>
        </SessionContext>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}
