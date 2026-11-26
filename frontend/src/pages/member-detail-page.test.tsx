import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  planCode: 'PERSONAL',
  planName: 'ATLAS Personal',
  maxPagesPerDocument: 1000,
  monthlyPageQuota: 50,
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
  actions: ['EDIT_PROFILE', 'CHANGE_PLAN'],
  pagesUsed: 39,
};

const PERIODO = {
  id: 'lote-periodo',
  source: 'MEMBERSHIP_PERIOD',
  planCode: 'PERSONAL',
  productCode: null,
  productName: null,
  quantity: 50,
  consumed: 39,
  held: 0,
  available: 11,
  startsAt: '2026-11-15T05:00:00.000Z',
  expiresAt: '2026-12-15T05:00:00.000Z',
  pricePaidCents: null,
  currency: null,
  paymentReference: null,
  note: null,
  registeredByName: null,
  createdAt: '2026-11-15T15:00:00.000Z',
};

const RECARGA_COMPRADA = {
  ...PERIODO,
  id: 'lote-recarga',
  source: 'PURCHASE',
  planCode: null,
  productCode: 'RECARGA',
  productName: 'ATLAS Recargas',
  quantity: 40,
  consumed: 0,
  available: 40,
  expiresAt: '2027-02-25T05:00:00.000Z',
  pricePaidCents: 600,
  currency: 'PEN',
  paymentReference: 'YAPE-1',
  registeredByName: 'Admin',
};

const SALDO = {
  balance: {
    pagesUsed: 39,
    monthlyPageQuota: 50,
    unlimited: false,
    membershipExpired: false,
    pagesAvailable: 51,
    period: { startsAt: PERIODO.startsAt, endsAt: PERIODO.expiresAt },
    lots: [PERIODO, RECARGA_COMPRADA],
  },
  history: [RECARGA_COMPRADA, PERIODO],
};

const PRODUCTOS = [
  {
    code: 'RECARGA',
    name: 'ATLAS Recargas',
    description: 'd',
    pricing: 'PER_PAGE',
    pageQuantity: null,
    minimumPages: 20,
    priceCents: 15,
    currency: 'PEN',
    validityDays: 90,
  },
  {
    code: 'PROFESIONAL_500',
    name: 'ATLAS Profesional 500',
    description: 'd',
    pricing: 'PACKAGE',
    pageQuantity: 500,
    minimumPages: null,
    priceCents: 2990,
    currency: 'PEN',
    validityDays: 90,
  },
];

/** Cotiza como la API: exacto por página, y sugiere Profesional 500 desde S/ 29.90. */
function cotizar(url: string): Record<string, unknown> {
  const [ruta, consulta] = url.split('?');
  if (ruta?.includes('PROFESIONAL_500')) {
    return {
      productCode: 'PROFESIONAL_500',
      pages: 500,
      priceCents: 2990,
      currency: 'PEN',
      validityDays: 90,
      suggestion: null,
    };
  }
  const paginas = Number(new URLSearchParams(consulta).get('pages') ?? '20');
  const total = paginas * 15;
  return {
    productCode: 'RECARGA',
    pages: paginas,
    priceCents: total,
    currency: 'PEN',
    validityDays: 90,
    suggestion:
      total >= 2990 && paginas <= 500
        ? {
            productCode: 'PROFESIONAL_500',
            name: 'ATLAS Profesional 500',
            pages: 500,
            priceCents: 2990,
            savingsCents: total - 2990,
          }
        : null,
  };
}

function montar(
  opciones: {
    detalle?: () => Response;
    saldo?: () => Response;
    cotizacion?: (url: string) => Promise<Response>;
  } = {},
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('/page-lots') && metodo === 'POST') {
      return Promise.resolve(jsonResponse(201, RECARGA_COMPRADA));
    }
    if (url.includes('/page-balance')) {
      return Promise.resolve(opciones.saldo?.() ?? jsonResponse(200, SALDO));
    }
    if (url.includes('/quote')) {
      return opciones.cotizacion?.(url) ?? Promise.resolve(jsonResponse(200, cotizar(url)));
    }
    if (url.includes('/v1/commercial-products')) {
      return Promise.resolve(jsonResponse(200, PRODUCTOS));
    }
    return Promise.resolve(opciones.detalle?.() ?? jsonResponse(200, DETALLE));
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(
    <Routes>
      <Route path="/usuarios/:userId" element={<MemberDetailPage />} />
    </Routes>,
    { ruta: `/usuarios/${USER_ID}` },
  );
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MemberDetailPage', () => {
  it('muestra sus datos y su saldo por lote, con el detalle de cada compra', async () => {
    montar();

    expect(await screen.findByText('Otra persona')).toBeInTheDocument();
    expect(screen.getByText('otra@empresa.pe')).toBeInTheDocument();
    expect(await screen.findByText(/Le quedan 51 páginas/)).toBeInTheDocument();
    expect(screen.getAllByText('Incluidas en la membresía').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ref\. YAPE-1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/por Admin/).length).toBeGreaterThan(0);
    expect(screen.getByText('Historial de lotes (2)')).toBeInTheDocument();
    expect(screen.getByText('Usuario')).toBeInTheDocument();
    expect(screen.getByText('ATLAS Personal')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Nunca')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver a Usuarios/ })).toHaveAttribute(
      'href',
      '/usuarios',
    );
  });

  it('sin tope de cobro, dice que no lleva saldo', async () => {
    montar({
      saldo: () =>
        jsonResponse(200, {
          balance: {
            ...SALDO.balance,
            unlimited: true,
            pagesAvailable: null,
            monthlyPageQuota: null,
            lots: [],
          },
          history: [],
        }),
    });

    expect(await screen.findByText(/no tiene tope de cobro: no lleva saldo/)).toBeInTheDocument();
  });

  it('registra una compra y propone el paquete que conviene', async () => {
    const fetchMock = montar();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Registrar compra' }));
    const dialogo = await screen.findByRole('dialog');
    await within(dialogo).findByText('ATLAS Recargas');

    const paginas = within(dialogo).getByLabelText('Páginas');
    await user.type(paginas, '200');
    expect(await within(dialogo).findByText(/Le conviene/)).toBeInTheDocument();
    await user.click(within(dialogo).getByRole('button', { name: 'Usar ese paquete' }));
    await waitFor(() => {
      expect(within(dialogo).getByText(/Total a cobrar/).textContent).toMatch(/500 páginas/);
    });

    await user.type(within(dialogo).getByLabelText('N.º de operación de Yape'), 'YAPE-9');
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar compra' }));

    await waitFor(() => {
      const compra = (fetchMock.mock.calls as [string, RequestInit | undefined][]).find(
        ([url, init]) => url.includes('/page-lots') && init?.method === 'POST',
      );
      expect(JSON.parse(compra?.[1]?.body as string)).toEqual({
        productCode: 'PROFESIONAL_500',
        paymentReference: 'YAPE-9',
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('una recarga bajo el mínimo no se puede registrar', async () => {
    montar();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Registrar compra' }));
    const dialogo = await screen.findByRole('dialog');
    await within(dialogo).findByText('ATLAS Recargas');
    await user.type(within(dialogo).getByLabelText('Páginas'), '5');

    expect(within(dialogo).getByText(/La recarga es desde 20 páginas/)).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Registrar compra' })).toBeDisabled();
  });

  it('oculta el precio anterior y espera la cotización del producto recién elegido', async () => {
    let responderCotizacion: (respuesta: Response) => void = () => undefined;
    const cotizacionPendiente = new Promise<Response>((resolve) => {
      responderCotizacion = resolve;
    });
    montar({
      cotizacion: (url) =>
        url.includes('PROFESIONAL_500')
          ? cotizacionPendiente
          : Promise.resolve(jsonResponse(200, cotizar(url))),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Registrar compra' }));
    const dialogo = within(await screen.findByRole('dialog'));
    expect(await dialogo.findByText(/Total a cobrar/)).toBeInTheDocument();

    await user.click(dialogo.getByRole('radio', { name: /Profesional 500/ }));

    expect(dialogo.getByRole('status')).toHaveTextContent('Calculando el precio');
    expect(dialogo.queryByText(/Total a cobrar/)).not.toBeInTheDocument();
    expect(dialogo.getByRole('button', { name: 'Registrar compra' })).toBeDisabled();
    responderCotizacion(jsonResponse(503, { code: 'UNAVAILABLE' }));
    expect(await dialogo.findByText('No se pudo calcular el precio')).toBeInTheDocument();
  });

  it('sin permiso para cambiar su membresía, no ofrece registrar compras', async () => {
    montar({ detalle: () => jsonResponse(200, { ...DETALLE, actions: ['EDIT_PROFILE'] }) });

    await screen.findByText(/Le quedan 51 páginas/);
    expect(screen.queryByRole('button', { name: 'Registrar compra' })).not.toBeInTheDocument();
  });

  it('un administrador no muestra vigencia, porque no vence', async () => {
    montar({
      detalle: () =>
        jsonResponse(200, {
          ...DETALLE,
          role: 'ADMIN',
          roleName: 'Administrador',
          planExpiryRequired: false,
          planExpiresOn: null,
        }),
    });

    await screen.findByText('Otra persona');
    expect(screen.queryByText('Vigencia')).not.toBeInTheDocument();
  });

  it('explica el motivo si no se pudo cargar', async () => {
    montar({ detalle: () => jsonResponse(403, { code: 'INSUFFICIENT_ROLE' }) });

    expect(
      await screen.findByText('Solo un administrador puede gestionar cuentas.'),
    ).toBeInTheDocument();
  });
});
