import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { FinancialCenterPage } from './financial-center-page';

const JOB_LIST = {
  items: [
    {
      jobId: 'job-1',
      statementId: 'stmt-1',
      status: 'SUCCEEDED',
      createdAt: '2026-09-20T10:00:00.000Z',
      extractorId: 'bcp-coordinate-v1',
      movementCount: 2,
      warningCount: 0,
      artifactCount: 3,
      uploadedByMe: true,
    },
  ],
  nextCursor: null,
};

const JOB_DETAIL = {
  jobId: 'job-1',
  statementId: 'stmt-1',
  status: 'SUCCEEDED',
  attemptNumber: 1,
  extractorId: 'bcp-coordinate-v1',
  extractorVersion: '1.0.0',
  rowCount: 4,
  movementCount: 2,
  pageCount: 1,
  warningCodes: [],
  checks: [],
  artifacts: [
    { id: 'art-xlsx', kind: 'RESULT_XLSX', byteSize: 100, name: 'statement.xlsx' },
    { id: 'art-mov', kind: 'RESULT_CSV', byteSize: 50, name: 'statement_Movimientos.csv' },
    { id: 'art-res', kind: 'RESULT_CSV', byteSize: 40, name: 'statement_Resumen.csv' },
  ],
  reused: false,
};

const MOVIMIENTOS_CSV = [
  'Página,Tipo de fila,Fecha proceso,Fecha valor,Descripción,Cargo,Abono,Saldo',
  '1,PREVIOUS_BALANCE,,,SALDO ANTERIOR,,,1000.00',
  '1,MOVEMENT,2026-09-02,2026-09-02,Deposito de la prueba,,500.00,1500.00',
  '1,MOVEMENT,2026-09-05,2026-09-05,Pago de la prueba,200.00,,1300.00',
  '',
].join('\r\n');

const RESUMEN_CSV = [
  'Estado,Extractor,Versión,Confianza,Páginas,Filas,Movimientos,Total cargos,Total abonos,Saldo final,Advertencias',
  'SUCCEEDED,bcp-coordinate-v1,1.0.0,0.95,1,4,2,200.00,500.00,1300.00,0',
  '',
].join('\r\n');

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** Responde como la API real: lista, detalle y contenido de cada artefacto. */
function stubApi(list: unknown = JOB_LIST): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const url = input;
      if (url.includes('/artifacts/art-mov/content')) {
        return Promise.resolve(new Response(MOVIMIENTOS_CSV));
      }
      if (url.includes('/artifacts/art-res/content')) {
        return Promise.resolve(new Response(RESUMEN_CSV));
      }
      if (/\/v1\/jobs\/job-1$/.test(url)) {
        return Promise.resolve(jsonResponse(JOB_DETAIL));
      }
      if (url.includes('/v1/jobs')) {
        return Promise.resolve(jsonResponse(list));
      }
      return Promise.reject(new Error(`URL inesperada: ${url}`));
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FinancialCenterPage', () => {
  it('ofrece el historial real en la preselección', async () => {
    stubApi();
    renderWithProviders(<FinancialCenterPage />);

    expect(screen.getByRole('heading', { name: 'Centro Financiero' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Elige los estados de cuenta a analizar' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^BCP —/)).toBeInTheDocument();
  });

  it('sin documentos procesados, invita a subir uno en vez de mostrar datos', async () => {
    stubApi({ items: [], nextCursor: null });
    renderWithProviders(<FinancialCenterPage />);

    expect(
      await screen.findByText(/Todavía no tienes documentos que consolidar/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Subir un estado de cuenta' })).toBeInTheDocument();
  });

  it('consolida leyendo los CSV publicados del documento elegido', async () => {
    const user = userEvent.setup();
    stubApi();
    renderWithProviders(<FinancialCenterPage />);

    await user.click(await screen.findByRole('button', { name: 'Consolidar y analizar' }));

    expect(await screen.findByText('Flujo neto del periodo')).toBeInTheDocument();
    // Los movimientos salen del CSV, no de datos simulados.
    expect(screen.getByText('Deposito de la prueba')).toBeInTheDocument();
    expect(screen.getByText('Pago de la prueba')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Elegir otros documentos' })).toBeInTheDocument();
  });

  it('avisa cuando un documento del consolidado no se pudo leer', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        const url = input;
        if (/\/v1\/jobs\/job-1$/.test(url)) {
          return Promise.resolve(
            new Response(JSON.stringify({ code: 'JOB_NOT_FOUND' }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(jsonResponse(JOB_LIST));
      }),
    );
    renderWithProviders(<FinancialCenterPage />);

    await user.click(await screen.findByRole('button', { name: 'Consolidar y analizar' }));

    expect(await screen.findByText(/No se pudieron leer todos los documentos/)).toBeInTheDocument();
  });
});
