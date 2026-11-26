import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { MemberDetailPage } from './member-detail-page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const USER_ID = '44444444-4444-4444-8444-444444444444';

const DETALLE = {
  userId: USER_ID,
  email: 'otra@empresa.pe',
  displayName: 'Otra persona',
  role: 'MEMBER',
  roleName: 'Usuario',
  roleRank: 10,
  planCode: 'BASICA',
  planName: 'Básica',
  maxPagesPerDocument: 1000,
  monthlyPageQuota: 15,
  monthlyPageQuotaOverride: null,
  planChangedAt: '2026-01-01T00:00:00.000Z',
  planExpiresOn: '2099-12-31',
  planExpired: false,
  planExpiryRequired: true,
  status: 'ACTIVE',
  membershipStatus: 'ACTIVE',
  documentCount: 2,
  lastLoginAt: null,
  createdAt: '2026-02-01T00:00:00.000Z',
  actions: ['EDIT_PROFILE'],
  pagesUsed: 4,
};

function montar(respuesta: () => Response = () => jsonResponse(200, DETALLE)): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(respuesta())),
  );
  renderWithProviders(
    <Routes>
      <Route path="/usuarios/:userId" element={<MemberDetailPage />} />
    </Routes>,
    { ruta: `/usuarios/${USER_ID}` },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MemberDetailPage', () => {
  it('muestra cuánto ha consumido y sus datos básicos', async () => {
    montar();

    expect(await screen.findByText('Otra persona')).toBeInTheDocument();
    expect(screen.getByText('otra@empresa.pe')).toBeInTheDocument();
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/4 de 15 páginas acumuladas este mes/);
    });
    expect(screen.getByText('Usuario')).toBeInTheDocument();
    expect(screen.getByText('Básica')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Nunca')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver a Usuarios/ })).toHaveAttribute(
      'href',
      '/usuarios',
    );
  });

  it('sin tope fijo, dice que se cotiza en vez de una barra', async () => {
    montar(() => jsonResponse(200, { ...DETALLE, monthlyPageQuota: null, pagesUsed: 7 }));

    expect(await screen.findByText(/no tiene tope fijo, se cotiza/)).toBeInTheDocument();
  });

  it('un administrador no muestra vigencia, porque no vence', async () => {
    montar(() =>
      jsonResponse(200, {
        ...DETALLE,
        role: 'ADMIN',
        roleName: 'Administrador',
        planExpiryRequired: false,
        planExpiresOn: null,
      }),
    );

    await screen.findByText('Otra persona');
    expect(screen.queryByText('Vigencia')).not.toBeInTheDocument();
  });

  it('explica el motivo si no se pudo cargar', async () => {
    montar(() => jsonResponse(403, { code: 'INSUFFICIENT_ROLE' }));

    expect(
      await screen.findByText('Solo un administrador puede gestionar cuentas.'),
    ).toBeInTheDocument();
  });
});
