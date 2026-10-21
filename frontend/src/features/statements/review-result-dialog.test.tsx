import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JobPage } from '@/pages/job-page';
import { renderWithProviders } from '@/test/render';

const JOB_ID = '33333333-3333-4333-8333-333333333333';
const STATEMENT_ID = '44444444-4444-4444-8444-444444444444';

/** Un BCP ficticio con la página 424 en blanco y 50,00 de abonos sin mostrar. */
const CON_HUECOS = {
  jobId: JOB_ID,
  statementId: STATEMENT_ID,
  sourceFileName: 'Mayo BCP.pdf',
  createdAt: '2026-10-21T05:30:00.000Z',
  status: 'NEEDS_REVIEW',
  attemptNumber: 1,
  extractorId: 'bcp-coordinate-v1',
  extractorVersion: '0.5.1',
  rowCount: 17_000,
  movementCount: 16_700,
  pageCount: 478,
  warningCodes: ['BCP_DECLARED_TOTAL_MISMATCH', 'BCP_BALANCE_MISMATCH', 'BCP_PAGE_INCOMPLETE'],
  warningPages: [{ code: 'BCP_PAGE_INCOMPLETE', page: 424 }],
  checks: [
    { code: 'BCP_DECLARED_TOTALS', status: 'FAILED' },
    { code: 'BCP_DOCUMENT_BALANCE', status: 'FAILED' },
  ],
  artifacts: [
    { id: 'xlsx', kind: 'RESULT_XLSX', byteSize: 900_000, name: 'statement.xlsx' },
    { id: 'resumen', kind: 'RESULT_CSV', byteSize: 300, name: 'statement_Resumen.csv' },
  ],
  reused: false,
};

const RESUMEN_CSV = [
  'Archivo,Tipo de cuenta,Moneda,Páginas,Filas,Movimientos,Saldo inicial,Total cargos,Total abonos,Saldo final,Advertencias',
  'Mayo BCP.pdf,,PEN,478,17000,16700,1000.00,300.00,500.00,1250.00,3',
].join('\n');

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Responde el trabajo y su Resumen, y registra los borrados que se piden. */
function api(job: Record<string, unknown> = CON_HUECOS): { borrados: string[] } {
  const borrados: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'DELETE') {
        borrados.push(url);
        return Promise.resolve(jsonResponse(200, { deletedCount: 1 }));
      }
      if (url.includes('/artifacts/resumen/content')) {
        return Promise.resolve(
          new Response(RESUMEN_CSV, { status: 200, headers: { 'content-type': 'text/csv' } }),
        );
      }
      return Promise.resolve(jsonResponse(200, job));
    }),
  );
  return { borrados };
}

/** Llega a la página del resultado como lo hace la carga: con el trabajo en el estado. */
function abrirTrasConvertir(job: Record<string, unknown> = CON_HUECOS): void {
  renderWithProviders(
    <Routes>
      <Route path="/" element={<p>Página de carga</p>} />
      <Route path="/jobs/:jobId" element={<JobPage />} />
    </Routes>,
    { ruta: { pathname: `/jobs/${JOB_ID}`, state: { job } } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Aviso al terminar una conversión que no cuadra', () => {
  it('explica dónde y cuánto, y con un Enter continúa sin borrar nada', async () => {
    const { borrados } = api();
    const user = userEvent.setup();
    abrirTrasConvertir();

    const dialogo = await screen.findByRole('dialog', {
      name: 'El resultado no cuadra con los totales del banco',
    });
    expect(within(dialogo).getByText(/Mayo BCP\.pdf/)).toBeInTheDocument();
    expect(
      within(dialogo).getByText(/^La página 424 trae bastantes menos movimientos/),
    ).toBeInTheDocument();
    // Las cifras salen del Resumen publicado, no de la API.
    expect(await within(dialogo).findByText('S/ 1,250.00')).toBeInTheDocument();
    expect(within(dialogo).getByText('S/ 1,200.00')).toBeInTheDocument();
    expect(within(dialogo).getByText(/faltan abonos por/)).toHaveTextContent(
      'Lo más probable: faltan abonos por S/ 50.00 que el PDF no muestra.',
    );
    expect(within(dialogo).getByRole('button', { name: 'Continuar' })).toHaveFocus();

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(borrados).toEqual([]);
    // Sigue en el resultado, con la advertencia y su página a la vista.
    expect(screen.getByRole('heading', { name: 'Advertencias' })).toBeInTheDocument();
    expect(screen.getAllByText(/La página 424/).length).toBeGreaterThan(0);
  });

  it('cerrar con Escape también conserva el resultado', async () => {
    const { borrados } = api();
    const user = userEvent.setup();
    abrirTrasConvertir();
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(borrados).toEqual([]);
  });

  it('volver a intentar borra esta conversión y lleva a subir el PDF otra vez', async () => {
    const { borrados } = api();
    const user = userEvent.setup();
    abrirTrasConvertir();
    const dialogo = await screen.findByRole('dialog');

    await user.click(within(dialogo).getByRole('button', { name: 'Volver a intentar' }));

    expect(await screen.findByText('Página de carga')).toBeInTheDocument();
    expect(borrados).toEqual([`http://127.0.0.1:3000/v1/statements/${STATEMENT_ID}`]);
    expect(screen.getByText('Sube otra vez «Mayo BCP.pdf»')).toBeInTheDocument();
  });

  it('cancelar la conversión la borra y lo dice', async () => {
    const { borrados } = api();
    const user = userEvent.setup();
    abrirTrasConvertir();
    const dialogo = await screen.findByRole('dialog');

    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar conversión' }));

    expect(await screen.findByText('Página de carga')).toBeInTheDocument();
    expect(borrados).toEqual([`http://127.0.0.1:3000/v1/statements/${STATEMENT_ID}`]);
    expect(screen.getByText('Se canceló la conversión')).toBeInTheDocument();
  });

  it('abrir el resultado desde un enlace o el historial no vuelve a preguntar', async () => {
    api();
    renderWithProviders(
      <Routes>
        <Route path="/jobs/:jobId" element={<JobPage />} />
      </Routes>,
      { ruta: `/jobs/${JOB_ID}` },
    );

    expect(await screen.findByRole('heading', { name: 'Advertencias' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un resultado que cuadra no pregunta nada', async () => {
    const limpio = { ...CON_HUECOS, status: 'SUCCEEDED', warningCodes: [], warningPages: [] };
    api(limpio);
    abrirTrasConvertir(limpio);

    expect(await screen.findByText('Resultado del procesamiento')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
