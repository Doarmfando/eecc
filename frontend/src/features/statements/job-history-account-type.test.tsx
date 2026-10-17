import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse } from '@/test/financial-api';
import { renderWithProviders } from '@/test/render';

import { JobHistory } from './job-history';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Una cuenta corriente y una de ahorro del BBVA, y un BCP que no declara el tipo. */
type Doc = { extractorId: string; name: string; tipo: string };

const CORRIENTE: Doc = {
  extractorId: 'bbva-account-v1',
  name: 'Cuenta 0011.pdf',
  tipo: 'CORRIENTE',
};
const AHORRO: Doc = { extractorId: 'bbva-account-v1', name: 'Cuenta 0022.pdf', tipo: 'AHORRO' };
const SIN_TIPO: Doc = { extractorId: 'bcp-coordinate-v1', name: 'Cuenta 0033.pdf', tipo: '' };

const DOCS: Record<string, Doc> = { 'job-cte': CORRIENTE, 'job-aho': AHORRO, 'job-bcp': SIN_TIPO };

/** Como lo publica BBVA: el saldo anterior es la primera fila de la hoja. */
const MOVIMIENTOS_CSV = [
  'Página,Tipo de fila,Fecha oper.,Fecha valor,Descripción,Cargo/Abono,ITF,Saldo contable',
  '1,SALDO_ANTERIOR,,,SALDO ANTERIOR,,,100.00',
  '1,MOVIMIENTO,2026-08-02,2026-08-02,Abono de la prueba,5.00,,105.00',
  '',
].join('\r\n');

function stubAccounts(docs: Record<string, Doc>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const artifact = /\/v1\/jobs\/([\w-]+)\/artifacts\/(\w+)\/content/.exec(url);
      if (artifact) {
        const tipo = docs[artifact[1] ?? '']?.tipo ?? '';
        return Promise.resolve(
          new Response(
            artifact[2] === 'mov'
              ? MOVIMIENTOS_CSV
              : `Archivo,Tipo de cuenta,Moneda\r\nx.pdf,${tipo},PEN\r\n`,
          ),
        );
      }
      const detail = /\/v1\/jobs\/([\w-]+)$/.exec(url);
      if (detail) {
        const jobId = detail[1] ?? '';
        return Promise.resolve(
          jsonResponse({
            jobId,
            statementId: 'stmt',
            status: 'SUCCEEDED',
            attemptNumber: 1,
            extractorId: docs[jobId]?.extractorId,
            extractorVersion: '1.0.0',
            rowCount: 2,
            movementCount: 1,
            pageCount: 1,
            warningCodes: [],
            checks: [],
            artifacts: [
              { id: 'mov', kind: 'RESULT_CSV', byteSize: 1, name: 'statement_Movimientos.csv' },
              { id: 'res', kind: 'RESULT_CSV', byteSize: 1, name: 'statement_Resumen.csv' },
            ],
            reused: false,
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          items: Object.entries(docs).map(([jobId, doc]) => ({
            jobId,
            statementId: 'stmt',
            sourceFileName: doc.name,
            status: 'SUCCEEDED',
            createdAt: '2026-09-20T10:00:00.000Z',
            extractorId: doc.extractorId,
            movementCount: 1,
            warningCount: 0,
            artifactCount: 3,
            uploadedByMe: true,
          })),
          nextCursor: null,
        }),
      );
    }),
  );
}

describe('JobHistory: tipo de cuenta', () => {
  it('dice el tipo de cuenta cuando el documento lo declara, y nada si no', async () => {
    stubAccounts(DOCS);
    renderWithProviders(<JobHistory />);

    expect(
      await screen.findByText('Agosto de 2026 · S/ Soles · Cuenta corriente'),
    ).toBeInTheDocument();
    expect(screen.getByText('Agosto de 2026 · S/ Soles · Cuenta de ahorro')).toBeInTheDocument();
    expect(screen.getByText('Agosto de 2026 · S/ Soles')).toBeInTheDocument();
  });

  it('agrupa por ahorro y corriente sin suponer el tipo de quien no lo declara', async () => {
    const user = userEvent.setup();
    stubAccounts(DOCS);
    renderWithProviders(<JobHistory />);

    const group = await screen.findByRole('radiogroup', { name: 'Tipo de cuenta' });
    await screen.findByText('Agosto de 2026 · S/ Soles · Cuenta de ahorro');
    expect(within(group).getByRole('radio', { name: 'Todas' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.click(within(group).getByRole('radio', { name: 'Ahorro' }));
    expect(screen.getByText('Cuenta 0022.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Cuenta 0011.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('Cuenta 0033.pdf')).not.toBeInTheDocument();

    await user.click(within(group).getByRole('radio', { name: 'Corriente' }));
    expect(screen.getByText('Cuenta 0011.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Cuenta 0022.pdf')).not.toBeInTheDocument();

    await user.click(within(group).getByRole('radio', { name: 'Todas' }));
    expect(screen.getByText('Cuenta 0033.pdf')).toBeInTheDocument();
  });

  it('el buscador también encuentra el tipo de cuenta', async () => {
    const user = userEvent.setup();
    stubAccounts(DOCS);
    renderWithProviders(<JobHistory />);
    await screen.findByText('Agosto de 2026 · S/ Soles · Cuenta de ahorro');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar en el historial' }), 'ahorro');

    expect(screen.getByText('Cuenta 0022.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Cuenta 0011.pdf')).not.toBeInTheDocument();
  });

  it('con un solo tipo no ofrece filtrar', async () => {
    stubAccounts({ 'job-cte': CORRIENTE, 'job-bcp': SIN_TIPO });
    renderWithProviders(<JobHistory />);

    await screen.findByText('Agosto de 2026 · S/ Soles · Cuenta corriente');
    expect(screen.queryByRole('radiogroup', { name: 'Tipo de cuenta' })).not.toBeInTheDocument();
  });
});
