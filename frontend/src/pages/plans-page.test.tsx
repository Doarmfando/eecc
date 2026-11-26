import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, TEST_USER } from '@/test/render';
import type { SessionUser } from '@/lib/session-client';

import { PlansPage } from './plans-page';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Solo un superadministrador tiene `PLANS_MANAGE` (ADR-0018). */
const SUPER_ADMIN: SessionUser = {
  ...TEST_USER,
  role: 'SUPER_ADMIN',
  roleName: 'Superadministrador',
  roleRank: 100,
  permissions: ['STATEMENTS_CONVERT', 'USERS_MANAGE', 'PLANS_MANAGE'],
};

const BASICA = {
  code: 'BASICA',
  name: 'Básica',
  description: 'Solo conversión',
  maxPagesPerDocument: 1000,
  monthlyPageQuota: 15,
  trialOneTime: false,
  features: ['FINANCIAL_CENTER'],
  isDefault: true,
  isActive: true,
  sortOrder: 1,
  priceCents: 1990,
  currency: 'PEN',
};

const ATLAS = {
  code: 'ATLAS',
  name: 'Atlas',
  description: 'Se cotiza por fuera',
  maxPagesPerDocument: 1000,
  monthlyPageQuota: null,
  trialOneTime: false,
  features: ['HISTORY', 'FINANCIAL_CENTER', 'FINANCIAL_CALENDAR'],
  isDefault: false,
  isActive: false,
  sortOrder: 9,
  priceCents: null,
  currency: 'PEN',
};

const RECARGA = {
  code: 'RECARGA',
  name: 'ATLAS Recargas',
  description: 'Páginas sueltas',
  pricing: 'PER_PAGE',
  pageQuantity: null,
  minimumPages: 20,
  priceCents: 15,
  currency: 'PEN',
  validityDays: 90,
  isActive: true,
  sortOrder: 10,
};

const PROFESIONAL_500 = {
  code: 'PROFESIONAL_500',
  name: 'ATLAS Profesional 500',
  description: 'En volumen',
  pricing: 'PACKAGE',
  pageQuantity: 500,
  minimumPages: null,
  priceCents: 2990,
  currency: 'PEN',
  validityDays: 90,
  isActive: true,
  sortOrder: 20,
};

type Respuestas = Partial<{
  lista: () => Response;
  alta: () => Response;
  edicion: () => Response;
  productos: () => Response;
  altaProducto: () => Response;
  edicionProducto: () => Response;
}>;

function apiFalsa(respuestas: Respuestas = {}): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('/v1/commercial-products')) {
      if (metodo === 'GET') {
        return Promise.resolve(
          respuestas.productos?.() ?? jsonResponse(200, [RECARGA, PROFESIONAL_500]),
        );
      }
      if (metodo === 'PATCH') {
        return Promise.resolve(respuestas.edicionProducto?.() ?? jsonResponse(200, RECARGA));
      }
      return Promise.resolve(respuestas.altaProducto?.() ?? jsonResponse(201, PROFESIONAL_500));
    }
    if (metodo === 'GET') {
      return Promise.resolve(respuestas.lista?.() ?? jsonResponse(200, [BASICA, ATLAS]));
    }
    if (metodo === 'PATCH') {
      return Promise.resolve(respuestas.edicion?.() ?? jsonResponse(200, BASICA));
    }
    return Promise.resolve(
      respuestas.alta?.() ?? jsonResponse(201, { ...BASICA, code: 'ESPECIAL', name: 'Especial' }),
    );
  });
}

function peticiones(fetchMock: ReturnType<typeof vi.fn>, metodo: string): [string, RequestInit][] {
  return (fetchMock.mock.calls as [string, RequestInit | undefined][])
    .filter(([, init]) => (init?.method ?? 'GET') === metodo)
    .map(([url, init]) => [url, init ?? {}]);
}

function cuerpo(init: RequestInit | undefined): unknown {
  return JSON.parse(init?.body as string);
}

async function montar(respuestas: Respuestas = {}): Promise<ReturnType<typeof vi.fn>> {
  const fetchMock = apiFalsa(respuestas);
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(<PlansPage />, { usuario: SUPER_ADMIN });
  await screen.findByText('Básica');
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PlansPage: listado', () => {
  it('muestra páginas al mes, vistas y estado de cada plan', async () => {
    await montar();

    const fila = screen.getByRole('row', { name: /Básica/ });
    expect(within(fila).getByText('predeterminado')).toBeInTheDocument();
    expect(within(fila).getByText('15')).toBeInTheDocument();
    expect(within(fila).getByText('Centro Financiero')).toBeInTheDocument();

    expect(within(fila).getByText(/^S\/ 19[.,]90$/)).toBeInTheDocument();

    const filaAtlas = screen.getByRole('row', { name: /^ATLAS Atlas/ });
    expect(within(filaAtlas).getByText('retirado')).toBeInTheDocument();
    expect(within(filaAtlas).getByText('Se cotiza')).toBeInTheDocument();
    expect(within(filaAtlas).getByText('Sin precio')).toBeInTheDocument();
    expect(
      within(filaAtlas).getByText('Historial, Centro Financiero, Calendario'),
    ).toBeInTheDocument();
  });

  it('avisa si no pudo cargar el catálogo', async () => {
    vi.stubGlobal(
      'fetch',
      apiFalsa({ lista: () => jsonResponse(403, { code: 'INSUFFICIENT_ROLE' }) }),
    );
    renderWithProviders(<PlansPage />, { usuario: SUPER_ADMIN });

    expect(await screen.findByText('No se pudo cargar el catálogo')).toBeInTheDocument();
  });
});

describe('PlansPage: nuevo plan', () => {
  it('crea un plan con los datos del formulario', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Nuevo plan' }));
    const dialogo = await screen.findByRole('dialog');

    await user.type(within(dialogo).getByLabelText('Código'), 'especial');
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Especial');
    await user.type(within(dialogo).getByLabelText('Descripción'), 'Historial y calendario');
    await user.type(within(dialogo).getByLabelText('Páginas acumuladas al mes'), '15');
    await user.click(within(dialogo).getByLabelText('Historial'));
    await user.click(within(dialogo).getByLabelText('Calendario'));
    await user.click(within(dialogo).getByRole('button', { name: 'Crear plan' }));

    await waitFor(() => {
      const [, alta] = peticiones(fetchMock, 'POST')[0] ?? [];
      expect(cuerpo(alta)).toEqual({
        code: 'ESPECIAL',
        name: 'Especial',
        description: 'Historial y calendario',
        maxPagesPerDocument: undefined,
        monthlyPageQuota: 15,
        trialOneTime: false,
        isDefault: false,
        isActive: true,
        sortOrder: 0,
        priceCents: null,
        features: ['HISTORY', 'FINANCIAL_CALENDAR'],
      });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el código escrito en minúsculas se guarda en mayúsculas', async () => {
    await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Nuevo plan' }));
    const dialogo = await screen.findByRole('dialog');
    await user.type(within(dialogo).getByLabelText('Código'), 'nuevo');

    expect(within(dialogo).getByLabelText('Código')).toHaveValue('NUEVO');
  });

  it('no envía nada sin código ni nombre', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Nuevo plan' }));
    const dialogo = await screen.findByRole('dialog');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear plan' }));

    expect(await within(dialogo).findByText('Escribe un código')).toBeInTheDocument();
    expect(within(dialogo).getByText('Escribe un nombre')).toBeInTheDocument();
    expect(peticiones(fetchMock, 'POST')).toHaveLength(0);
  });

  it('traduce el rechazo por código repetido', async () => {
    await montar({ alta: () => jsonResponse(409, { code: 'PLAN_ALREADY_EXISTS' }) });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Nuevo plan' }));
    const dialogo = await screen.findByRole('dialog');
    await user.type(within(dialogo).getByLabelText('Código'), 'BASICA');
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Básica otra vez');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear plan' }));

    expect(
      await within(dialogo).findByText(
        'Ya existe un plan con ese código. Elige otro: no se puede reutilizar.',
      ),
    ).toBeInTheDocument();
  });
});

describe('PlansPage: editar plan', () => {
  it('abre con los datos actuales y guarda solo lo que se cambia a mano', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(
      within(screen.getByRole('row', { name: /Básica/ })).getByRole('button', { name: 'Editar' }),
    );
    const dialogo = await screen.findByRole('dialog');

    expect(within(dialogo).getByLabelText('Código')).toHaveValue('BASICA');
    expect(within(dialogo).getByLabelText('Código')).toHaveAttribute('readonly');
    expect(within(dialogo).getByLabelText('Nombre')).toHaveValue('Básica');
    expect(within(dialogo).getByLabelText('Páginas acumuladas al mes')).toHaveValue(15);
    expect(within(dialogo).getByLabelText('Centro Financiero')).toBeChecked();

    const paginas = within(dialogo).getByLabelText('Páginas acumuladas al mes');
    await user.clear(paginas);
    await user.type(paginas, '20');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      const [url, edicion] = peticiones(fetchMock, 'PATCH')[0] ?? [];
      expect(url).toContain('/v1/plans/BASICA');
      expect(cuerpo(edicion)).toMatchObject({ monthlyPageQuota: 20, name: 'Básica' });
    });
  });

  it('cambia el precio escrito con coma y lo envía en céntimos', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(
      within(screen.getByRole('row', { name: /Básica/ })).getByRole('button', { name: 'Editar' }),
    );
    const dialogo = await screen.findByRole('dialog');
    const precio = within(dialogo).getByLabelText('Precio publicado (S/)');
    expect(precio).toHaveValue('19.90');

    await user.clear(precio);
    await user.type(precio, '24,5');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(cuerpo(peticiones(fetchMock, 'PATCH')[0]?.[1])).toMatchObject({ priceCents: 2450 });
    });
  });

  it('no envía un precio ilegible y dice cómo escribirlo', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(
      within(screen.getByRole('row', { name: /Básica/ })).getByRole('button', { name: 'Editar' }),
    );
    const dialogo = await screen.findByRole('dialog');
    const precio = within(dialogo).getByLabelText('Precio publicado (S/)');
    await user.clear(precio);
    await user.type(precio, '19.999');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    expect(within(dialogo).getByText(/Escribe un precio como 19.90/)).toBeInTheDocument();
    expect(peticiones(fetchMock, 'PATCH')).toHaveLength(0);
  });

  it('quitar el precio lo envía como nulo, no como cero', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(
      within(screen.getByRole('row', { name: /Básica/ })).getByRole('button', { name: 'Editar' }),
    );
    const dialogo = await screen.findByRole('dialog');
    await user.clear(within(dialogo).getByLabelText('Precio publicado (S/)'));
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(cuerpo(peticiones(fetchMock, 'PATCH')[0]?.[1])).toMatchObject({ priceCents: null });
    });
  });

  it('retira un plan desmarcando "Activo"', async () => {
    const fetchMock = await montar();
    const user = userEvent.setup();

    await user.click(
      within(screen.getByRole('row', { name: /Básica/ })).getByRole('button', { name: 'Editar' }),
    );
    const dialogo = await screen.findByRole('dialog');
    await user.click(within(dialogo).getByLabelText('Activo (se ofrece en altas y cambios)'));
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(cuerpo(peticiones(fetchMock, 'PATCH')[0]?.[1])).toMatchObject({ isActive: false });
    });
  });
});

describe('PlansPage: productos de saldo', () => {
  async function montarConProductos(
    respuestas: Respuestas = {},
  ): Promise<ReturnType<typeof vi.fn>> {
    const fetchMock = await montar(respuestas);
    await screen.findByText('ATLAS Recargas');
    return fetchMock;
  }

  it('lista recargas y paquetes con lo que se cobra y cuándo vence', async () => {
    await montarConProductos();

    const recarga = screen.getByRole('row', { name: /ATLAS Recargas/ });
    expect(within(recarga).getByText(/^S\/ 0[.,]15 por página$/)).toBeInTheDocument();
    expect(within(recarga).getByText('Desde 20 páginas')).toBeInTheDocument();
    expect(within(recarga).getByText('90 días')).toBeInTheDocument();

    const paquete = screen.getByRole('row', { name: /ATLAS Profesional 500/ });
    expect(within(paquete).getByText(/^S\/ 29[.,]90$/)).toBeInTheDocument();
    expect(within(paquete).getByText('500 páginas')).toBeInTheDocument();
  });

  it('crea un paquete con el precio en céntimos', async () => {
    const fetchMock = await montarConProductos();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    const dialogo = await screen.findByRole('dialog');
    await user.type(within(dialogo).getByLabelText('Código'), 'profesional_10000');
    await user.type(within(dialogo).getByLabelText('Nombre'), 'ATLAS Profesional 10000');
    await user.type(within(dialogo).getByLabelText('Páginas del paquete'), '10000');
    await user.type(within(dialogo).getByLabelText('Precio del paquete (S/)'), '129.90');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      const [url, alta] = peticiones(fetchMock, 'POST')[0] ?? [];
      expect(url).toContain('/v1/commercial-products');
      expect(cuerpo(alta)).toEqual({
        code: 'PROFESIONAL_10000',
        pricing: 'PACKAGE',
        name: 'ATLAS Profesional 10000',
        description: '',
        priceCents: 12990,
        validityDays: 90,
        isActive: true,
        sortOrder: 0,
        pageQuantity: 10000,
      });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('una recarga pide su mínimo y su precio por página', async () => {
    const fetchMock = await montarConProductos();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    const dialogo = await screen.findByRole('dialog');
    await user.click(within(dialogo).getByLabelText('Por página'));
    await user.type(within(dialogo).getByLabelText('Código'), 'RECARGA_PLUS');
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Recarga plus');
    await user.type(within(dialogo).getByLabelText('Mínimo de páginas'), '50');
    await user.type(within(dialogo).getByLabelText('Precio por página (S/)'), '0.12');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      expect(cuerpo(peticiones(fetchMock, 'POST')[0]?.[1])).toMatchObject({
        pricing: 'PER_PAGE',
        minimumPages: 50,
        priceCents: 12,
      });
    });
    expect(cuerpo(peticiones(fetchMock, 'POST')[0]?.[1])).not.toHaveProperty('pageQuantity');
  });

  it('no envía un producto sin páginas ni precio', async () => {
    const fetchMock = await montarConProductos();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    const dialogo = await screen.findByRole('dialog');
    await user.type(within(dialogo).getByLabelText('Código'), 'X_Y');
    await user.type(within(dialogo).getByLabelText('Nombre'), 'x');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear producto' }));

    expect(
      await within(dialogo).findByText('Indica cuántas páginas trae el paquete'),
    ).toBeInTheDocument();
    expect(within(dialogo).getByText(/Escribe un precio como 29.90/)).toBeInTheDocument();
    expect(peticiones(fetchMock, 'POST')).toHaveLength(0);
  });

  it('edita el precio de la recarga sin poder cambiar su código ni su forma de cobro', async () => {
    const fetchMock = await montarConProductos();
    const user = userEvent.setup();

    await user.click(
      within(screen.getByRole('row', { name: /ATLAS Recargas/ })).getByRole('button', {
        name: 'Editar',
      }),
    );
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByLabelText('Código')).toHaveAttribute('readonly');
    expect(within(dialogo).getByLabelText('Paquete')).toBeDisabled();
    expect(within(dialogo).getByLabelText('Mínimo de páginas')).toHaveValue(20);

    const precio = within(dialogo).getByLabelText('Precio por página (S/)');
    expect(precio).toHaveValue('0.15');
    await user.clear(precio);
    await user.type(precio, '0.13');
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      const [url, edicion] = peticiones(fetchMock, 'PATCH')[0] ?? [];
      expect(url).toContain('/v1/commercial-products/RECARGA');
      expect(cuerpo(edicion)).toMatchObject({ priceCents: 13, minimumPages: 20 });
    });
  });

  it('traduce el rechazo por código repetido', async () => {
    await montarConProductos({
      altaProducto: () => jsonResponse(409, { code: 'PRODUCT_ALREADY_EXISTS' }),
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    const dialogo = await screen.findByRole('dialog');
    await user.type(within(dialogo).getByLabelText('Código'), 'RECARGA');
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Otra');
    await user.type(within(dialogo).getByLabelText('Páginas del paquete'), '10');
    await user.type(within(dialogo).getByLabelText('Precio del paquete (S/)'), '1');
    await user.click(within(dialogo).getByRole('button', { name: 'Crear producto' }));

    expect(
      await within(dialogo).findByText(
        'Ya existe un producto con ese código. Elige otro: no se puede reutilizar.',
      ),
    ).toBeInTheDocument();
  });
});
