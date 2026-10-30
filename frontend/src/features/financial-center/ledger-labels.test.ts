import { describe, expect, it } from 'vitest';

import { statementFixture } from '@/test/financial-fixtures';

import { buildLedger, type LedgerIssue } from './ledger';
import { accountLabel, describeIssue, documentLabel } from './ledger-labels';

const ENERO = statementFixture({
  id: 'ene',
  nombreDocumento: 'Enero.pdf',
  cuenta: { clave: 'aaaaaaaa', terminacion: '1234' },
  saldoFinal: 50000,
});
const FEBRERO = statementFixture({
  id: 'feb',
  cuenta: { clave: 'aaaaaaaa', terminacion: '1234' },
  fechaPeriodo: '2026-02',
  periodoLabel: 'Febrero de 2026',
  saldoInicial: 40000,
});
const ledger = buildLedger([ENERO, FEBRERO]);
const accountKey = ledger.accounts[0]?.key ?? '';

function text(issue: LedgerIssue): string {
  return describeIssue(issue, ledger).text;
}

describe('etiquetas', () => {
  it('la cuenta se nombra por su terminación, o se dice que no se identificó', () => {
    const [identified] = ledger.accounts;
    const [unidentified] = buildLedger([statementFixture({})]).accounts;
    if (!identified || !unidentified) {
      throw new Error('Faltan cuentas en el consolidado de prueba.');
    }
    expect(accountLabel(identified)).toBe('BCP ···1234');
    expect(accountLabel(unidentified)).toBe('BCP · cuenta sin identificar');
  });

  it('el documento se nombra por su PDF o, sin él, por banco y mes', () => {
    expect(documentLabel(ENERO)).toBe('Enero.pdf');
    expect(documentLabel(FEBRERO)).toBe('BCP · Febrero de 2026');
  });
});

describe('describeIssue', () => {
  it('explica cada aviso en palabras, con documentos y cuentas por su nombre', () => {
    expect(text({ kind: 'DOCUMENTO_DUPLICADO', statementId: 'feb', duplicateOf: 'ene' })).toBe(
      '«BCP · Febrero de 2026» es una copia exacta de «Enero.pdf»: se cuenta una sola vez.',
    );
    expect(
      text({ kind: 'PERIODO_SUPERPUESTO', accountKey, statementIds: ['ene', 'feb'] }),
    ).toContain('BCP ···1234: «Enero.pdf» y «BCP · Febrero de 2026» cubren el mismo periodo');
    expect(text({ kind: 'PERIODOS_FALTANTES', accountKey, months: ['2026-03'] })).toBe(
      'BCP ···1234: falta Marzo de 2026. Su saldo acumulado no es confiable.',
    );
    expect(
      text({
        kind: 'SALDO_DISCONTINUO',
        accountKey,
        statementIds: ['ene', 'feb'],
        expectedCents: 50000,
        foundCents: 40000,
      }),
    ).toBe(
      'BCP ···1234: «BCP · Febrero de 2026» empieza con S/ 400.00, pero «Enero.pdf» terminó con S/ 500.00.',
    );
    expect(text({ kind: 'REQUIERE_REVISION', statementId: 'ene' })).toContain(
      '«Requiere revisión»',
    );
    expect(text({ kind: 'MONEDA_SUPUESTA', statementId: 'ene' })).toContain('se muestra en soles');
    expect(text({ kind: 'CUENTA_NO_IDENTIFICADA', statementId: 'ene' })).toContain(
      'se agrupan por banco',
    );
    expect(text({ kind: 'FECHAS_ANTERIORES_AL_ARREGLO', statementId: 'ene' })).toContain(
      'Vuelve a subirlo',
    );
    expect(text({ kind: 'MOVIMIENTOS_INCONSISTENTES', statementId: 'ene', count: 1 })).toBe(
      '«Enero.pdf»: 1 movimiento tiene importes que no cuadran entre columnas.',
    );
    expect(text({ kind: 'MOVIMIENTOS_INCONSISTENTES', statementId: 'ene', count: 3 })).toContain(
      '3 movimientos tienen',
    );
  });

  it('separa lo que afecta a los números de lo informativo', () => {
    expect(describeIssue({ kind: 'MONEDA_SUPUESTA', statementId: 'ene' }, ledger).severity).toBe(
      'info',
    );
    expect(describeIssue({ kind: 'REQUIERE_REVISION', statementId: 'ene' }, ledger).severity).toBe(
      'warning',
    );
  });

  it('no falla si el aviso nombra algo que ya no está', () => {
    expect(text({ kind: 'REQUIERE_REVISION', statementId: 'otro' })).toContain('un documento');
    expect(text({ kind: 'PERIODOS_FALTANTES', accountKey: 'x', months: ['2026-03'] })).toContain(
      'Una cuenta',
    );
  });
});
