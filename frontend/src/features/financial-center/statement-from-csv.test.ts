import { describe, expect, it } from 'vitest';

import {
  buildFinancialStatement,
  inferCategory,
  pickPeriod,
  readSummary,
  type StatementCsvSource,
} from './statement-from-csv';

/**
 * Los CSV de estas pruebas reproducen las cabeceras reales de cada exportador
 * (`backend/pdf-worker/src/statement_worker/exporters/*_workbook.py`) con
 * importes inventados. Ningún dato viene de un estado de cuenta real.
 */
function csv(...lines: readonly string[]): string {
  return `${lines.join('\r\n')}\r\n`;
}

function source(overrides: Partial<StatementCsvSource>): StatementCsvSource {
  return {
    jobId: 'job-1',
    extractorId: 'bcp-coordinate-v1',
    movementsCsv: '',
    summaryCsv: null,
    fallbackPeriod: '2026-01',
    ...overrides,
  };
}

const BCP_MOVEMENTS = csv(
  'Página,Tipo de fila,Fecha proceso,Fecha valor,Descripción,Cargo,Abono,Saldo',
  '1,PREVIOUS_BALANCE,,,SALDO ANTERIOR,,,1000.00',
  '1,MOVEMENT,2026-09-02,2026-09-02,Transferencia recibida,,500.00,1500.00',
  '1,MOVEMENT,2026-09-05,2026-09-05,Pago de servicios agua,200.00,,1300.00',
  '1,MOVEMENT_TOTAL,,,TOTAL MOVIMIENTOS,200.00,500.00,',
  '1,BALANCE,,,SALDO FINAL,,,1300.00',
);

const BCP_SUMMARY = csv(
  'Estado,Extractor,Versión,Confianza,Páginas,Filas,Movimientos,Total cargos,Total abonos,Saldo final,Advertencias',
  'SUCCEEDED,bcp-coordinate-v1,1.0.0,0.95,1,5,2,200.00,500.00,1300.00,0',
);

describe('buildFinancialStatement con BCP', () => {
  const statement = buildFinancialStatement(
    source({ movementsCsv: BCP_MOVEMENTS, summaryCsv: BCP_SUMMARY }),
  );

  it('deja fuera las filas que no son movimientos', () => {
    expect(statement.movimientos).toHaveLength(2);
    expect(statement.movimientos.map((movimiento) => movimiento.description)).toEqual([
      'Transferencia recibida',
      'Pago de servicios agua',
    ]);
  });

  it('toma el saldo inicial de la fila de saldo anterior, que el resumen no declara', () => {
    expect(statement.saldoInicial).toBe(100000);
  });

  it('muestra los totales que declara el documento', () => {
    expect(statement).toMatchObject({
      bancoOrigen: 'bcp',
      abonos: 50000,
      cargos: 20000,
      saldoFinal: 130000,
      fechaPeriodo: '2026-09',
    });
  });

  it('clasifica cada movimiento por el signo neto de sus columnas', () => {
    expect(statement.movimientos[0]).toMatchObject({ type: 'ABONO', amountCents: 50000 });
    expect(statement.movimientos[1]).toMatchObject({ type: 'CARGO', amountCents: 20000 });
  });

  it('marca como conciliada la fila cuyo saldo declarado cuadra con el arrastre', () => {
    expect(statement.movimientos.every((movimiento) => movimiento.reconciled)).toBe(true);
  });
});

const INTERBANK_MOVEMENTS = csv(
  'Página,Fecha,Concepto,Ingresos,Gastos,Saldo contable',
  '1,2026-08-03,Abono de haberes,300.00,,1100.00',
  '1,2026-08-10,Retiro en cajero,,50.00,1000.00',
  '1,2026-08-15,Interés ganado,20.00,,1020.00',
);

const INTERBANK_SUMMARY = csv(
  'Estado,Extractor,Versión,Confianza,Moneda,Páginas,Movimientos,Saldo inicial,Total ingresos,Total gastos,Saldo final,Advertencias',
  'NEEDS_REVIEW,interbank-savings-v1,1.0.0,0.90,PEN,1,3,800.00,320.00,50.00,1020.00,1',
);

describe('buildFinancialStatement con Interbank', () => {
  const statement = buildFinancialStatement(
    source({
      extractorId: 'interbank-savings-v1',
      movementsCsv: INTERBANK_MOVEMENTS,
      summaryCsv: INTERBANK_SUMMARY,
    }),
  );

  it('entiende los rótulos propios del banco', () => {
    expect(statement).toMatchObject({
      bancoOrigen: 'interbank',
      saldoInicial: 80000,
      abonos: 32000,
      cargos: 5000,
      saldoFinal: 102000,
    });
  });

  it('señala solo la fila descuadrada y sigue desde el saldo que ella declara', () => {
    // 800 + 300 = 1100 cuadra; 1100 − 50 = 1050 y el documento dice 1000, así que
    // esa fila no concilia; la siguiente se comprueba contra 1000, no contra 1050.
    expect(statement.movimientos.map((movimiento) => movimiento.reconciled)).toEqual([
      true,
      false,
      true,
    ]);
  });
});

const NACION_MOVEMENTS = csv(
  'Página,Fecha,Fecha valor,Descripción,Cargos,Abonos,Saldo',
  '1,2026-07-04,2026-07-04,Deposito en efectivo,,150.00,650.00',
);

describe('buildFinancialStatement con Banco de la Nación', () => {
  it('reconoce el banco aunque el selector de carga todavía no lo ofrezca', () => {
    const statement = buildFinancialStatement(
      source({ extractorId: 'banco-nacion-v1', movementsCsv: NACION_MOVEMENTS }),
    );

    expect(statement.bancoOrigen).toBe('nacion');
    expect(statement.fechaPeriodo).toBe('2026-07');
  });
});

const GENERIC_MOVEMENTS = csv(
  'Página,Fecha,Fecha valor,Descripción,Referencia,Cargo,Abono,Saldo',
  '1,2026-06-02,2026-06-02,Abono varios,REF1,,10.00,',
  '1,2026-06-09,2026-06-09,Cargo varios,REF2,4.00,,',
);

describe('buildFinancialStatement con el respaldo genérico', () => {
  const statement = buildFinancialStatement(
    source({ extractorId: 'generic-table-v1', movementsCsv: GENERIC_MOVEMENTS }),
  );

  it('suma los movimientos cuando el resumen no declara totales', () => {
    expect(statement).toMatchObject({ abonos: 1000, cargos: 400, saldoFinal: 600 });
  });

  it('no marca nada como conciliado si el documento no trae columna de saldo', () => {
    expect(statement.movimientos.every((movimiento) => !movimiento.reconciled)).toBe(true);
  });

  it('cae en «otro banco» y no descarta el documento', () => {
    expect(statement.bancoOrigen).toBe('otro');
  });
});

describe('buildFinancialStatement sin fechas legibles', () => {
  it('usa el periodo de respaldo en vez de quedarse sin mes', () => {
    const statement = buildFinancialStatement(
      source({
        extractorId: 'quien-sabe-v9',
        movementsCsv: csv('Fecha,Descripción,Abono', ',Sin fecha,5.00'),
        fallbackPeriod: '2026-03',
      }),
    );

    expect(statement.fechaPeriodo).toBe('2026-03');
    expect(statement.bancoOrigen).toBe('otro');
  });
});

describe('pickPeriod', () => {
  it('elige el mes donde cae la mayoría de los movimientos', () => {
    expect(pickPeriod(['2026-08-30', '2026-09-01', '2026-09-02'])).toBe('2026-09');
  });

  it('empatados, se queda con el más reciente', () => {
    expect(pickPeriod(['2026-08-30', '2026-09-02'])).toBe('2026-09');
  });

  it('ignora lo que no sea una fecha ISO', () => {
    expect(pickPeriod(['', 'ayer'])).toBe('');
  });
});

describe('readSummary', () => {
  it('devuelve nulos cuando el trabajo no publicó resumen', () => {
    expect(readSummary(null)).toEqual({
      saldoInicial: null,
      abonos: null,
      cargos: null,
      saldoFinal: null,
    });
  });

  it('lee los totales con cualquiera de sus dos rótulos', () => {
    expect(readSummary(INTERBANK_SUMMARY)).toMatchObject({ abonos: 32000, cargos: 5000 });
    expect(readSummary(BCP_SUMMARY)).toMatchObject({ abonos: 50000, cargos: 20000 });
  });
});

describe('inferCategory', () => {
  it('agrupa por palabras del propio texto del movimiento', () => {
    expect(inferCategory('ITF - impuesto a las transacciones')).toBe('Impuestos');
    expect(inferCategory('Retiro en cajero automático')).toBe('Retiros');
    expect(inferCategory('Transferencia enviada a proveedor')).toBe('Transferencias');
  });

  it('no fuerza una etiqueta cuando no reconoce nada', () => {
    expect(inferCategory('ABC123')).toBe('Otros movimientos');
  });
});
