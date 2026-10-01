import { vi } from 'vitest';

/**
 * Una API simulada con un documento de BCP procesado: lista, detalle y los dos
 * CSV publicados. La comparten las páginas que consolidan el historial.
 */

export const JOB_LIST = {
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

export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** Responde como la API real: lista, detalle y contenido de cada artefacto. */
export function stubApi(list: unknown = JOB_LIST): void {
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
