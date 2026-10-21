import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/app/app';
import { createQueryClient } from '@/app/query-client';

const BASE = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'persona@empresa.pe',
  displayName: 'Persona de prueba',
  organizationId: '22222222-2222-4222-8222-222222222222',
  organizationName: 'Organización de prueba',
  role: 'MEMBER',
  roleName: 'Usuario',
  roleRank: 10,
  permissions: ['STATEMENTS_CONVERT'],
  supportPhone: '+51 999 888 777',
};

const SESION_BASICA = {
  ...BASE,
  plan: {
    code: 'BASICA',
    name: 'Básica',
    maxRetainedStatements: 3,
    maxPagesPerDocument: 15,
    features: [],
  },
  retainedStatementsPerUser: 3,
};

const SESION_ATLAS = {
  ...BASE,
  plan: {
    code: 'ATLAS',
    name: 'Atlas',
    maxRetainedStatements: 20,
    maxPagesPerDocument: null,
    features: ['FINANCIAL_CALENDAR', 'FINANCIAL_CENTER', 'HISTORY'],
  },
  retainedStatementsPerUser: 20,
};

const PLANES = [
  {
    code: 'BASICA',
    name: 'Básica',
    description: 'Solo conversión',
    maxRetainedStatements: 3,
    maxPagesPerDocument: 15,
    features: [],
    isDefault: true,
  },
  {
    code: 'ATLAS',
    name: 'Atlas',
    description: 'Todo',
    maxRetainedStatements: 20,
    maxPagesPerDocument: null,
    features: ['FINANCIAL_CALENDAR', 'FINANCIAL_CENTER', 'HISTORY'],
    isDefault: false,
  },
];

const JOB = {
  jobId: '33333333-3333-4333-8333-333333333333',
  statementId: '44444444-4444-4444-8444-444444444444',
  createdAt: '2026-10-20T05:30:00.000Z',
  status: 'SUCCEEDED',
  attemptNumber: 1,
  extractorId: 'bbva-account-v1',
  extractorVersion: '0.4.0',
  rowCount: 3,
  movementCount: 2,
  pageCount: 1,
  warningCodes: [],
  checks: [],
  artifacts: [],
  reused: false,
};

/** `n` documentos propios; el `Doc 01.pdf` es el más antiguo. */
function propios(n: number): unknown {
  return {
    items: Array.from({ length: n }, (_, i) => {
      const numero = String(i + 1).padStart(2, '0');
      return {
        jobId: `job-${numero}`,
        statementId: `doc-${numero}`,
        sourceFileName: `Doc ${numero}.pdf`,
        status: 'SUCCEEDED',
        createdAt: `2026-10-${numero}T10:00:00.000Z`,
        extractorId: 'bbva-account-v1',
        movementCount: 2,
        warningCount: 0,
        artifactCount: 6,
        uploadedByMe: true,
      };
    }).reverse(),
    nextCursor: null,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stub(
  sesion: unknown,
  historial: unknown,
  subida: () => Response = () => jsonResponse(201, JOB),
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'POST') {
      return Promise.resolve(subida());
    }
    if (url.includes('/v1/auth/me')) {
      return Promise.resolve(jsonResponse(200, sesion));
    }
    if (url.includes('/v1/plans')) {
      return Promise.resolve(jsonResponse(200, PLANES));
    }
    if (/\/v1\/jobs(\?|$)/.test(url)) {
      return Promise.resolve(jsonResponse(200, historial));
    }
    return Promise.resolve(jsonResponse(200, JOB));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function abrir(ruta = '/'): void {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <App queryClient={createQueryClient()} />
    </MemoryRouter>,
  );
}

function posts(mock: ReturnType<typeof vi.fn>): FormData[] {
  return mock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => (init as RequestInit).body as FormData);
}

async function subir(nombre: string): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.upload(
    await screen.findByLabelText('Estado de cuenta en PDF'),
    new File(['%PDF-1.7'], nombre, { type: 'application/pdf' }),
  );
  await screen.findByText(/usados|ya los tienes todos/);
  await user.click(screen.getByRole('button', { name: /Procesar estado de cuenta/ }));
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Membresía Básica', () => {
  it('solo ofrece convertir y dice sus límites junto al formulario', async () => {
    stub(SESION_BASICA, propios(1));
    abrir();

    const menu = await screen.findByRole('navigation', { name: 'Navegación' });
    expect(within(menu).getByRole('link', { name: 'Nuevo documento' })).toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: 'Historial' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: 'Centro Financiero' })).not.toBeInTheDocument();
    expect(await screen.findByText(/hasta 15 páginas por PDF/)).toBeInTheDocument();
  });

  it('una vista que no incluye se explica, con la membresía que sí la trae', async () => {
    stub(SESION_BASICA, propios(1));
    abrir('/historial');

    expect(
      await screen.findByText('Historial no está incluido en tu membresía'),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Está en la membresía Atlas/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Convertir un estado de cuenta' })).toBeInTheDocument();
  });

  it('un PDF largo se rechaza diciendo cuántas páginas tiene y cuántas admite', async () => {
    stub(SESION_BASICA, propios(0), () =>
      jsonResponse(422, {
        code: 'PDF_PAGE_LIMIT_EXCEEDED',
        requestId: 'req-paginas',
        meta: { pageCount: 424, maxPages: 15 },
      }),
    );
    abrir();
    await subir('Mayo BCP.pdf');

    const aviso = await screen.findByRole('alert');
    expect(within(aviso).getByText('No se pudo procesar «Mayo BCP.pdf»')).toBeInTheDocument();
    expect(
      within(aviso).getByText(/El PDF tiene 424 páginas y tu membresía admite hasta 15/),
    ).toBeInTheDocument();
    expect(within(aviso).getByText('req-paginas')).toBeInTheDocument();
  });
});

describe('Membresía Atlas', () => {
  it('con 20 guardados, el 21 propone el más antiguo, Enter lo reemplaza y se avisa', async () => {
    const fetchMock = stub(SESION_ATLAS, propios(20), () =>
      jsonResponse(201, {
        ...JOB,
        replacedStatements: [{ statementId: 'doc-01', sourceFileName: 'Doc 01.pdf' }],
      }),
    );
    abrir();
    const user = await subir('Setiembre.pdf');

    const dialogo = await screen.findByRole('dialog', { name: /Ya tienes tus 20 documentos/ });
    expect(within(dialogo).getByText(/Tu membresía Atlas guarda 20/)).toBeInTheDocument();
    expect(within(dialogo).getByRole('radio', { name: /Doc 01\.pdf/ })).toBeChecked();
    expect(within(dialogo).getAllByRole('radio')).toHaveLength(20);

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(posts(fetchMock)[0]?.get('replaceStatementId')).toBe('doc-01');
    });
    expect(await screen.findByText('Se reemplazó «Doc 01.pdf»')).toBeInTheDocument();
    expect(screen.getByText('Setiembre.pdf convertido')).toBeInTheDocument();
  });

  it('tiene todas las vistas en el menú', async () => {
    stub(SESION_ATLAS, propios(1));
    abrir();

    const menu = await screen.findByRole('navigation', { name: 'Navegación' });
    for (const vista of ['Historial', 'Centro Financiero', 'Calendario']) {
      expect(within(menu).getByRole('link', { name: vista })).toBeInTheDocument();
    }
  });
});

describe('Vigencia de la membresía', () => {
  it('vencida: lo dice con la fecha y no deja convertir', async () => {
    stub(
      { ...SESION_ATLAS, plan: { ...SESION_ATLAS.plan, expiresOn: '2026-01-31', expired: true } },
      propios(1),
    );
    abrir();

    expect(await screen.findByText(/Tu membresía Atlas venció el/)).toBeInTheDocument();
    expect(screen.getByText(/No puedes convertir documentos/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+51 999 888 777/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Procesar estado de cuenta/ })).toBeDisabled();
  });

  it('por vencer: avisa con tiempo y deja convertir', async () => {
    const dentroDeTres = new Date();
    dentroDeTres.setDate(dentroDeTres.getDate() + 3);
    const dia = `${String(dentroDeTres.getFullYear())}-${String(dentroDeTres.getMonth() + 1).padStart(2, '0')}-${String(dentroDeTres.getDate()).padStart(2, '0')}`;
    stub(
      { ...SESION_BASICA, plan: { ...SESION_BASICA.plan, expiresOn: dia, expired: false } },
      propios(0),
    );
    abrir();

    expect(await screen.findByText('Tu membresía Básica: vence en 3 días')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Procesar estado de cuenta/ })).toBeEnabled();
  });
});
