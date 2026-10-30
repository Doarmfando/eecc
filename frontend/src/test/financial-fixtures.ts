import type { FinancialStatement, FinancialTransaction } from '@/features/financial-center/types';

/**
 * Movimiento de prueba con los campos de trazabilidad completos. Si la prueba no
 * dice otra cosa, cargo y abono salen de `type` y `amountCents`, como los
 * calcula la normalización real.
 */
export function transactionFixture(overrides: Partial<FinancialTransaction>): FinancialTransaction {
  const type = overrides.type ?? 'ABONO';
  const amountCents = overrides.amountCents ?? 10000;
  return {
    id: 'tx-1',
    statementId: 'job-1',
    bankId: 'bcp',
    currency: 'PEN',
    date: '2026-01-15',
    valueDate: null,
    description: 'Movimiento de prueba',
    category: 'Otros movimientos',
    type,
    amountCents,
    debitCents: type === 'CARGO' ? amountCents : 0,
    creditCents: type === 'ABONO' ? amountCents : 0,
    balanceCents: null,
    reconciled: true,
    outsidePeriod: false,
    issues: [],
    source: { page: 1, row: 1 },
    ...overrides,
  };
}

export function statementFixture(overrides: Partial<FinancialStatement>): FinancialStatement {
  return {
    id: 'job-1',
    nombreDocumento: null,
    estado: 'SUCCEEDED',
    versionExtractor: null,
    bancoOrigen: 'bcp',
    moneda: 'PEN',
    monedaDeclarada: true,
    cuenta: null,
    tipoFecha: 'PROCESO',
    fechaPeriodo: '2026-01',
    periodoLabel: 'Enero de 2026',
    periodoDeclarado: null,
    saldoInicial: 0,
    abonos: 0,
    cargos: 0,
    saldoFinal: 0,
    movimientos: [],
    ...overrides,
  };
}
