import type { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/app/app';
import { createQueryClient } from '@/app/query-client';

const JOB = {
  jobId: '33333333-3333-4333-8333-333333333333',
  statementId: '22222222-2222-4222-8222-222222222222',
  status: 'NEEDS_REVIEW',
  attemptNumber: 1,
  extractorId: 'bcp-coordinate-v1',
  extractorVersion: '0.1.0',
  rowCount: 12,
  movementCount: 8,
  pageCount: 2,
  warningCodes: ['BCP_AMOUNT_UNPARSEABLE'],
  checks: [
    { code: 'BCP_ROWS_PRESENT', status: 'PASSED' },
    { code: 'BCP_DECLARED_TOTALS', status: 'FAILED' },
  ],
  artifacts: [{ id: 'artifact-id', kind: 'RESULT_XLSX', byteSize: 2048, name: 'statement.xlsx' }],
  reused: false,
};

const SESION = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'persona@empresa.pe',
  displayName: 'Persona de prueba',
  organizationId: '22222222-2222-4222-8222-222222222222',
  organizationName: 'Organización de prueba',
  role: 'MEMBER',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderApp(client: QueryClient = createQueryClient()): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App queryClient={client} />
    </MemoryRouter>,
  );
}

/**
 * La aplicación pregunta al servidor si hay sesión antes de dibujar nada, porque
 * la cookie es httpOnly y no puede leerla. Se espera a que aparezca el formulario.
 */
async function esperarSesion(): Promise<void> {
  await screen.findByLabelText('Estado de cuenta en PDF');
}

function pdfFile(name = 'estado.pdf'): File {
  return new File(['%PDF-1.7 contenido'], name, { type: 'application/pdf' });
}

const EMPTY_HISTORY = { items: [], nextCursor: null };

/**
 * La página consulta el historial, y al navegar el detalle consulta el trabajo:
 * el doble responde por ruta para que cada prueba mida solo lo suyo.
 */
function routedFetch(uploadResponse: () => Response): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') !== 'GET') {
      return Promise.resolve(uploadResponse());
    }
    if (url.includes('/v1/auth/me')) {
      return Promise.resolve(jsonResponse(200, SESION));
    }
    const isHistory = /\/v1\/jobs(\?|$)/.test(url);
    return Promise.resolve(isHistory ? jsonResponse(200, EMPTY_HISTORY) : jsonResponse(200, JOB));
  });
}

function uploadCalls(mock: ReturnType<typeof vi.fn>): unknown[] {
  return mock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UploadPage', () => {
  it('lleva al inicio de sesión cuando no hay ninguna activa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { code: 'AUTHENTICATION_REQUIRED' })),
    );
    renderApp();

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Estado de cuenta en PDF')).not.toBeInTheDocument();
  });

  it('muestra el formulario de carga con la sesión resuelta', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch(() => jsonResponse(201, JOB)),
    );
    renderApp();
    await esperarSesion();

    expect(screen.getByRole('button', { name: /Procesar estado de cuenta/ })).toBeEnabled();
    expect(screen.getByText('Persona de prueba')).toBeInTheDocument();
  });

  it('rechaza en el borde un archivo vacío, sin llamar al servidor', async () => {
    const fetchMock = routedFetch(() => jsonResponse(201, JOB));
    vi.stubGlobal('fetch', fetchMock);
    renderApp();
    await esperarSesion();

    const user = userEvent.setup();
    await user.upload(
      screen.getByLabelText('Estado de cuenta en PDF'),
      new File([], 'vacio.pdf', { type: 'application/pdf' }),
    );

    expect(await screen.findByText('El archivo está vacío.')).toBeInTheDocument();
    expect(uploadCalls(fetchMock)).toHaveLength(0);
  });

  it('procesa un documento y muestra el resultado sin llamarlo éxito', async () => {
    // Cada llamada necesita su propia respuesta: el cuerpo solo puede leerse una vez.
    const fetchMock = routedFetch(() => jsonResponse(201, JOB));
    vi.stubGlobal('fetch', fetchMock);
    renderApp();
    await esperarSesion();

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Estado de cuenta en PDF'), pdfFile());
    await user.click(screen.getByRole('button', { name: /Procesar estado de cuenta/ }));

    expect(await screen.findByTestId('status-badge')).toHaveTextContent('Requiere revisión');
    expect(screen.getByText('Hay salida utilizable, pero con discrepancias')).toBeInTheDocument();
    expect(screen.getByText('Un importe no pudo interpretarse con certeza.')).toBeInTheDocument();
    expect(screen.getByText('Los totales declarados cuadran')).toBeInTheDocument();
    expect(screen.getByText('No cumple')).toBeInTheDocument();
    expect(screen.getByText('Excel del estado de cuenta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Descargar/ })).toBeInTheDocument();
  });

  it('muestra progreso mientras el servidor procesa', async () => {
    let resolveResponse: (value: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/v1/auth/me')) {
          return Promise.resolve(jsonResponse(200, SESION));
        }
        if ((init?.method ?? 'GET') === 'GET') {
          return Promise.resolve(jsonResponse(200, EMPTY_HISTORY));
        }
        return new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        });
      }),
    );
    renderApp();
    await esperarSesion();

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Estado de cuenta en PDF'), pdfFile());
    await user.click(screen.getByRole('button', { name: /Procesar estado de cuenta/ }));

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText(/Extrayendo, validando invariantes/)).toBeInTheDocument();

    resolveResponse(jsonResponse(201, JOB));
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  it('muestra un mensaje entendible y la referencia cuando el servidor rechaza', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch(() =>
        jsonResponse(422, { code: 'UNSUPPORTED_DOCUMENT', requestId: 'req-987654321' }),
      ),
    );
    renderApp();
    await esperarSesion();

    const user = userEvent.setup();
    await user.upload(screen.getByLabelText('Estado de cuenta en PDF'), pdfFile());
    await user.click(screen.getByRole('button', { name: /Procesar estado de cuenta/ }));

    await waitFor(() => {
      expect(
        screen.getByText('El documento no corresponde a un estado de cuenta compatible.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Referencia: req-987654321')).toBeInTheDocument();
  });
});
