import { act, render, screen, waitFor, within } from '@testing-library/react';
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
    maxPagesPerDocument: 1000,
    monthlyPageQuota: 10,
    trialOneTime: false,
    trialAvailable: true,
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
    maxPagesPerDocument: 1000,
    monthlyPageQuota: null,
    trialOneTime: false,
    trialAvailable: true,
    features: ['FINANCIAL_CALENDAR', 'FINANCIAL_CENTER', 'HISTORY'],
  },
  retainedStatementsPerUser: 20,
};

const SESION_PERSONAL = {
  ...SESION_ATLAS,
  plan: { ...SESION_ATLAS.plan, code: 'PERSONAL', name: 'ATLAS Personal', monthlyPageQuota: 50 },
};

const PLANES = [
  {
    code: 'BASICA',
    name: 'Básica',
    description: 'Solo conversión',
    maxRetainedStatements: 3,
    maxPagesPerDocument: 1000,
    monthlyPageQuota: 10,
    trialOneTime: false,
    features: [],
    isDefault: true,
  },
  {
    code: 'ATLAS',
    name: 'Atlas',
    description: 'Todo',
    maxRetainedStatements: 20,
    maxPagesPerDocument: 1000,
    monthlyPageQuota: null,
    trialOneTime: false,
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
  saldo: unknown = { pagesUsed: 0, monthlyPageQuota: 10 },
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
    if (url.includes('/v1/statements/usage')) {
      return Promise.resolve(jsonResponse(200, saldo));
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

async function subir(
  nombre: string,
  historial?: ReturnType<typeof vi.fn>,
): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.upload(
    await screen.findByLabelText('Estado de cuenta en PDF'),
    new File(['%PDF-1.7'], nombre, { type: 'application/pdf' }),
  );
  // Antes de enviar, que el historial ya haya respondido: si no, el cupo se
  // evalúa contra una lista vacía y nunca pregunta qué reemplazar.
  if (historial) {
    await waitFor(() => {
      expect(historial).toHaveBeenCalledWith(
        expect.stringContaining('/v1/jobs'),
        expect.anything(),
      );
    });
  }
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
    expect(within(menu).getByRole('link', { name: 'Mi saldo' })).toHaveAttribute('href', '/saldo');
    expect(within(menu).queryByRole('link', { name: 'Historial' })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: 'Centro Financiero' })).not.toBeInTheDocument();
    expect(await screen.findByText(/10 páginas acumuladas al mes/)).toBeInTheDocument();
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
      within(aviso).getByText(/El PDF tiene 424 páginas y ahora puedes convertir hasta 15/),
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
    const user = await subir('Setiembre.pdf', fetchMock);

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

  it('permite convertir con páginas compradas después de vencer la membresía', async () => {
    const fetchMock = stub(
      {
        ...SESION_PERSONAL,
        plan: { ...SESION_PERSONAL.plan, expiresOn: '2026-01-31', expired: true },
      },
      propios(20),
      () => jsonResponse(201, { ...JOB, replacedStatementCount: 1 }),
      {
        pagesUsed: 0,
        monthlyPageQuota: null,
        unlimited: false,
        membershipExpired: true,
        pagesAvailable: 20,
        lots: [
          {
            source: 'PURCHASE',
            productName: 'ATLAS Recargas',
            quantity: 20,
            consumed: 0,
            available: 20,
            startsAt: '2026-01-01T05:00:00.000Z',
            expiresAt: '2099-05-01T05:00:00.000Z',
          },
        ],
      },
    );
    abrir();

    expect(await screen.findByText(/Puedes seguir convirtiendo con las 20 páginas/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Procesar estado de cuenta' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Historial' })).not.toBeInTheDocument();
    await subir('Estado sintético.pdf');
    expect(await screen.findByText('Se reemplazó el documento más antiguo')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(posts(fetchMock)[0]?.get('replaceStatementId')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/jobs\?/),
      expect.anything(),
    );
  });

  it.each([
    { escenario: 'cierra el historial al vencer', renovada: false },
    { escenario: 'reconoce una renovación registrada durante la sesión', renovada: true },
  ])('en una pestaña abierta $escenario', async ({ renovada }) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-12-01T04:59:59.000Z'));
      const sesion = {
        ...SESION_PERSONAL,
        plan: {
          ...SESION_PERSONAL.plan,
          expired: false,
          expiresOn: '2026-11-30',
          accessEndsAt: '2026-12-01T05:00:00.000Z',
        },
      };
      stub(sesion, propios(0));
      await act(async () => {
        abrir('/historial');
        await vi.advanceTimersByTimeAsync(0);
      });
      const menu = within(screen.getByRole('navigation', { name: 'Navegación' }));
      expect(menu.getByRole('link', { name: 'Historial' })).toBeInTheDocument();
      if (renovada) {
        sesion.plan.expiresOn = '2026-12-31';
        sesion.plan.accessEndsAt = '2027-01-01T05:00:00.000Z';
      } else {
        sesion.plan.expired = true;
        sesion.plan.features = [];
      }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      if (renovada) {
        expect(menu.getByRole('link', { name: 'Historial' })).toBeInTheDocument();
        return;
      }
      expect(menu.queryByRole('link', { name: 'Historial' })).not.toBeInTheDocument();
      expect(screen.getByText('Venció tu membresía ATLAS Personal')).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });
});
