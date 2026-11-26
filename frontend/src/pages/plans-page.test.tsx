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
  maxRetainedStatements: 3,
  maxPagesPerDocument: 1000,
  monthlyPageQuota: 15,
  trialOneTime: false,
  features: ['FINANCIAL_CENTER'],
  isDefault: true,
  isActive: true,
  sortOrder: 1,
};

const ATLAS = {
  code: 'ATLAS',
  name: 'Atlas',
  description: 'Se cotiza por fuera',
  maxRetainedStatements: 20,
  maxPagesPerDocument: 1000,
  monthlyPageQuota: null,
  trialOneTime: false,
  features: ['HISTORY', 'FINANCIAL_CENTER', 'FINANCIAL_CALENDAR'],
  isDefault: false,
  isActive: false,
  sortOrder: 9,
};

type Respuestas = Partial<{
  lista: () => Response;
  alta: () => Response;
  edicion: () => Response;
}>;

function apiFalsa(respuestas: Respuestas = {}): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    const metodo = (init?.method ?? 'GET').toUpperCase();
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

    const filaAtlas = screen.getByRole('row', { name: /Atlas/ });
    expect(within(filaAtlas).getByText('retirado')).toBeInTheDocument();
    expect(within(filaAtlas).getByText('Se cotiza')).toBeInTheDocument();
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
    const documentos = within(dialogo).getByLabelText('Documentos guardados');
    await user.clear(documentos);
    await user.type(documentos, '5');
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
        maxRetainedStatements: 5,
        maxPagesPerDocument: undefined,
        monthlyPageQuota: 15,
        trialOneTime: false,
        isDefault: false,
        isActive: true,
        sortOrder: 0,
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

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
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
