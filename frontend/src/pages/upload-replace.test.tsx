import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/app/app';
import { createQueryClient } from '@/app/query-client';

const SESION = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'persona@empresa.pe',
  displayName: 'Persona de prueba',
  organizationId: '22222222-2222-4222-8222-222222222222',
  organizationName: 'Organización de prueba',
  role: 'MEMBER',
  retainedStatementsPerUser: 3,
};

const JOB = {
  jobId: '33333333-3333-4333-8333-333333333333',
  statementId: '44444444-4444-4444-8444-444444444444',
  createdAt: '2026-10-17T05:30:00.000Z',
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

/** Tres documentos propios, a propósito desordenados: el más antiguo es `viejo`. */
function propios(): unknown {
  const doc = (id: string, nombre: string, createdAt: string): unknown => ({
    jobId: `job-${id}`,
    statementId: id,
    sourceFileName: nombre,
    status: 'SUCCEEDED',
    createdAt,
    extractorId: 'bbva-account-v1',
    movementCount: 2,
    warningCount: 0,
    artifactCount: 6,
    uploadedByMe: true,
  });
  return {
    items: [
      doc('medio', 'Julio.pdf', '2026-10-15T10:00:00.000Z'),
      doc('nuevo', 'Agosto.pdf', '2026-10-16T10:00:00.000Z'),
      doc('viejo', 'Junio.pdf', '2026-10-14T10:00:00.000Z'),
    ],
    nextCursor: null,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stub(history: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') !== 'GET') {
      return Promise.resolve(jsonResponse(201, JOB));
    }
    if (url.includes('/v1/auth/me')) {
      return Promise.resolve(jsonResponse(200, SESION));
    }
    return Promise.resolve(
      /\/v1\/jobs(\?|$)/.test(url) ? jsonResponse(200, history) : jsonResponse(200, JOB),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function posts(mock: ReturnType<typeof vi.fn>): FormData[] {
  return mock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    .map(([, init]) => (init as RequestInit).body as FormData);
}

async function subir(nombre = 'Setiembre.pdf'): Promise<ReturnType<typeof userEvent.setup>> {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App queryClient={createQueryClient()} />
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.upload(
    await screen.findByLabelText('Estado de cuenta en PDF'),
    new File(['%PDF-1.7'], nombre, { type: 'application/pdf' }),
  );
  // El aviso del cupo confirma que el historial ya llegó.
  await screen.findByText(/usados|ya los tienes todos/);
  await user.click(screen.getByRole('button', { name: /Procesar estado de cuenta/ }));
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UploadPage: elegir qué documento reemplazar al llegar al cupo', () => {
  it('propone el más antiguo y con un Enter lo reemplaza', async () => {
    const fetchMock = stub(propios());
    const user = await subir();

    const dialog = await screen.findByRole('dialog', { name: /Ya tienes tus 3 documentos/ });
    expect(within(dialog).getByText('Setiembre.pdf')).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: /Junio\.pdf/ })).toBeChecked();
    expect(within(dialog).getByText(/el más antiguo/)).toBeInTheDocument();
    // Nada se sube hasta confirmar.
    expect(posts(fetchMock)).toHaveLength(0);
    expect(within(dialog).getByRole('button', { name: 'Reemplazar y procesar' })).toHaveFocus();

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(posts(fetchMock)).toHaveLength(1);
    });
    expect(posts(fetchMock)[0]?.get('replaceStatementId')).toBe('viejo');
  });

  it('reemplaza el que la persona elige', async () => {
    const fetchMock = stub(propios());
    const user = await subir();
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('radio', { name: /Agosto\.pdf/ }));
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(posts(fetchMock)).toHaveLength(1);
    });
    expect(posts(fetchMock)[0]?.get('replaceStatementId')).toBe('nuevo');
  });

  it('cancelar no sube nada', async () => {
    const fetchMock = stub(propios());
    const user = await subir();
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it('sin llegar al cupo sube directamente, sin preguntar', async () => {
    const fetchMock = stub({ items: [], nextCursor: null });
    await subir();

    await waitFor(() => {
      expect(posts(fetchMock)).toHaveLength(1);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(posts(fetchMock)[0]?.has('replaceStatementId')).toBe(false);
  });
});
