import { describe, expect, it } from 'vitest';

import {
  buildFinancialStatement,
  inferCategory,
  ITF_DESCRIPTION,
  pickPeriod,
  readSummary,
  type StatementCsvSource,
} from './statement-from-csv';
import type { FinancialStatement } from './types';

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

  it('trata como soles un BCP procesado antes de que publicara su moneda', () => {
    expect(statement.moneda).toBe('PEN');
  });

  it('usa la moneda que el BCP publica al final de su resumen', () => {
    const dollars = buildFinancialStatement(
      source({
        movementsCsv: BCP_MOVEMENTS,
        summaryCsv: csv(
          'Estado,Extractor,Versión,Confianza,Páginas,Filas,Movimientos,Total cargos,Total abonos,Saldo final,Advertencias,Moneda',
          'SUCCEEDED,bcp-coordinate-v1,0.1.0,0.95,1,5,2,200.00,500.00,1300.00,0,USD',
        ),
      }),
    );
    expect(dollars.moneda).toBe('USD');
    expect(dollars.movimientos.map((movimiento) => movimiento.currency)).toEqual(['USD', 'USD']);
  });

  it('clasifica cada movimiento por el signo neto de sus columnas', () => {
    expect(statement.movimientos[0]).toMatchObject({ type: 'ABONO', amountCents: 50000 });
    expect(statement.movimientos[1]).toMatchObject({ type: 'CARGO', amountCents: 20000 });
  });

  it('marca como conciliada la fila cuyo saldo declarado cuadra con el arrastre', () => {
    expect(statement.movimientos.every((movimiento) => movimiento.reconciled)).toBe(true);
  });
});

// El BCP de hoy: tipos de fila en español, como BBVA, y el tipo de cuenta en el resumen.
const BCP_V3_MOVEMENTS = csv(
  'Página,Tipo de fila,Fecha proceso,Fecha valor,Descripción,Cargo/Abono,Cargo,Abono,Saldo',
  '1,SALDO_ANTERIOR,,,SALDO ANTERIOR,,,,1000.00',
  '1,MOVIMIENTO,2026-09-02,2026-09-02,Transferencia recibida,500.00,,500.00,',
  '1,MOVIMIENTO,2026-09-05,2026-09-05,Pago de servicios agua,-200.00,200.00,,',
  '1,TOTAL_MOVIMIENTO,,,TOTAL MOVIMIENTOS,300.00,200.00,500.00,',
  '1,SALDO,,,SALDO,,,,1300.00',
);

const BCP_V3_SUMMARY = csv(
  'Archivo,Tipo de cuenta,Moneda,Páginas,Filas,Movimientos,Saldo inicial,Total cargos,Total abonos,Saldo final,Advertencias',
  'Agosto.pdf,AHORRO,PEN,1,5,2,1000.00,200.00,500.00,1300.00,0',
);

describe('buildFinancialStatement con el BCP de tipos en español', () => {
  const statement = buildFinancialStatement(
    source({ movementsCsv: BCP_V3_MOVEMENTS, summaryCsv: BCP_V3_SUMMARY }),
  );

  it('deja fuera saldo anterior, totales y saldo', () => {
    expect(statement.movimientos.map((movimiento) => movimiento.description)).toEqual([
      'Transferencia recibida',
      'Pago de servicios agua',
    ]);
  });

  it('agrupa por el tipo de cuenta que declara su resumen', () => {
    expect(statement).toMatchObject({
      tipoCuenta: 'AHORRO',
      saldoInicial: 100000,
      abonos: 50000,
      cargos: 20000,
      saldoFinal: 130000,
    });
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

const BBVA_MOVEMENTS = csv(
  'Página,Fecha oper.,Fecha valor,Descripción,Cargo/Abono,ITF,Saldo contable',
  '1,2026-07-02,2026-07-02,Abono por transferencia,500.00,0.02,1499.98',
  '1,2026-07-05,2026-07-05,Pago a proveedor,-200.00,0.01,1299.97',
  '1,2026-07-09,2026-07-09,Comision de mantenimiento,-10.00,,1289.97',
);

const BBVA_SUMMARY = csv(
  'Estado,Extractor,Versión,Confianza,Moneda,Páginas,Movimientos,Saldo anterior,Total abonos,Total cargos,Total ITF,Saldo contable final,Advertencias',
  'SUCCEEDED,bbva-account-v1,0.1.0,0.90,USD,1,3,1000.00,499.98,210.01,0.03,1289.97,0',
);

describe('buildFinancialStatement con BBVA', () => {
  const statement = buildFinancialStatement(
    source({
      extractorId: 'bbva-account-v1',
      movementsCsv: BBVA_MOVEMENTS,
      summaryCsv: BBVA_SUMMARY,
    }),
  );

  it('reconoce el banco y la moneda que declara su resumen', () => {
    expect(statement).toMatchObject({
      bancoOrigen: 'bbva',
      moneda: 'USD',
      fechaPeriodo: '2026-07',
    });
    expect(statement.movimientos.every((movimiento) => movimiento.currency === 'USD')).toBe(true);
  });

  it('lee cargo y abono de su única columna con signo', () => {
    const own = statement.movimientos.filter((m) => m.description !== ITF_DESCRIPTION);
    expect(own.map((m) => [m.type, m.amountCents])).toEqual([
      ['ABONO', 50000],
      ['CARGO', 20000],
      ['CARGO', 1000],
    ]);
  });

  it('muestra el ITF como cargo aparte, junto al movimiento que lo generó', () => {
    expect(statement.movimientos.map((m) => [m.description, m.amountCents])).toEqual([
      ['Abono por transferencia', 50000],
      [ITF_DESCRIPTION, 2],
      ['Pago a proveedor', 20000],
      [ITF_DESCRIPTION, 1],
      ['Comision de mantenimiento', 1000],
    ]);
    expect(statement.movimientos[1]).toMatchObject({ type: 'CARGO', category: 'Impuestos' });
  });

  it('no cuenta dos veces el ITF que el resumen ya resta de cada fila', () => {
    // Los Excel anteriores a ADR-0013 publicaban abonos netos de ITF (499.98) y
    // cargos con su ITF (210.01); siguen en el historial y deben leerse bien.
    // Sumarle además el «Total ITF» descuadraba el periodo en el documento real.
    expect(statement.abonos).toBe(
      statement.movimientos
        .filter((m) => m.type === 'ABONO')
        .reduce((t, m) => t + m.amountCents, 0),
    );
    expect(statement.cargos).toBe(
      statement.movimientos
        .filter((m) => m.type === 'CARGO')
        .reduce((t, m) => t + m.amountCents, 0),
    );
  });

  it('suma el ITF a las salidas para que el periodo cuadre con el saldo final', () => {
    expect(statement).toMatchObject({
      saldoInicial: 100000,
      abonos: 50000,
      cargos: 21003,
      saldoFinal: 128997,
    });
    expect(statement.saldoInicial + statement.abonos - statement.cargos).toBe(statement.saldoFinal);
  });

  it('concilia cada fila descontando su ITF, como hace el banco', () => {
    expect(statement.movimientos.every((movimiento) => movimiento.reconciled)).toBe(true);

    const broken = buildFinancialStatement(
      source({
        extractorId: 'bbva-account-v1',
        movementsCsv: BBVA_MOVEMENTS.replace('1299.97', '1300.00'),
        summaryCsv: BBVA_SUMMARY,
      }),
    );
    // La fila descuadrada y su ITF comparten marca; la siguiente sigue desde 1300.00.
    expect(broken.movimientos.map((m) => m.reconciled)).toEqual([true, true, false, false, false]);
  });
});

/** El mismo documento con la hoja que publica BBVA desde que lee la cabecera. */
const BBVA_V2_MOVEMENTS = csv(
  'Página,Tipo de fila,Fecha oper.,Fecha valor,Descripción,Cargo/Abono,ITF,Saldo contable',
  '1,SALDO_ANTERIOR,,,SALDO ANTERIOR,,,1000.00',
  '1,MOVIMIENTO,2026-07-02,2026-07-02,Abono por transferencia,500.00,0.02,1499.98',
  '1,MOVIMIENTO,2026-07-05,2026-07-05,Pago a proveedor,-200.00,0.01,1299.97',
  '1,MOVIMIENTO,2026-07-09,2026-07-09,Comision de mantenimiento,-10.00,,1289.97',
);

const BBVA_V2_SUMMARY = csv(
  'Archivo,Tipo de cuenta,Moneda,Páginas,Movimientos,Saldo anterior,Total abonos,Total cargos,Total ITF,Saldo contable final,Advertencias',
  'Julio.pdf,CORRIENTE,USD,1,4,1000.00,499.98,210.01,0.03,1289.97,0',
);

describe('buildFinancialStatement con la hoja BBVA que incluye el saldo anterior', () => {
  const previous = buildFinancialStatement(
    source({
      extractorId: 'bbva-account-v1',
      movementsCsv: BBVA_MOVEMENTS,
      summaryCsv: BBVA_SUMMARY,
    }),
  );
  const current = buildFinancialStatement(
    source({
      extractorId: 'bbva-account-v1',
      movementsCsv: BBVA_V2_MOVEMENTS,
      summaryCsv: BBVA_V2_SUMMARY,
    }),
  );

  it('no convierte el saldo anterior en un movimiento', () => {
    // La hoja nueva trae una fila más arriba (el saldo anterior) y el nombre del
    // PDF: cambia dónde está cada fila, no lo que dice.
    const withoutTrace = (statement: FinancialStatement): FinancialStatement => ({
      ...statement,
      tipoCuenta: undefined,
      nombreDocumento: null,
      movimientos: statement.movimientos.map((movement) => ({
        ...movement,
        source: { page: movement.source.page, row: 0 },
      })),
    });
    expect(withoutTrace(current)).toEqual(withoutTrace(previous));
    expect(current.tipoCuenta).toBe('CORRIENTE');
    expect(current.nombreDocumento).toBe('Julio.pdf');
    expect(current.movimientos[0]?.source).toEqual({ page: 1, row: 2 });
    expect(previous.movimientos[0]?.source).toEqual({ page: 1, row: 1 });
  });

  it('sin resumen, toma el saldo inicial de la fila de saldo anterior', () => {
    const statement = buildFinancialStatement(
      source({ extractorId: 'bbva-account-v1', movementsCsv: BBVA_V2_MOVEMENTS }),
    );
    expect(statement.saldoInicial).toBe(100000);
    expect(statement.tipoCuenta).toBeUndefined();
  });
});

const NACION_MOVEMENTS = csv(
  'Página,Fecha,Fecha valor,Descripción,Cargos,Abonos,Saldo',
  '1,2026-07-04,2026-07-04,Deposito en efectivo,,150.00,650.00',
);

describe('buildFinancialStatement con Banco de la Nación', () => {
  it('reconoce el banco por su extractor', () => {
    const statement = buildFinancialStatement(
      source({ extractorId: 'banco-nacion-v1', movementsCsv: NACION_MOVEMENTS }),
    );

    expect(statement.bancoOrigen).toBe('nacion');
    expect(statement.fechaPeriodo).toBe('2026-07');
  });

  it('lee igual con la columna `Cargo/Abono` que hoy publican todos los bancos', () => {
    const withSigned = csv(
      'Página,Fecha,Fecha valor,Descripción,Cargo/Abono,Cargos,Abonos,Saldo',
      '1,2026-07-04,2026-07-04,Deposito en efectivo,150.00,,150.00,650.00',
      '1,2026-07-05,2026-07-05,Pago de servicio,-50.00,50.00,,600.00',
    );
    const withoutSigned = csv(
      'Página,Fecha,Fecha valor,Descripción,Cargos,Abonos,Saldo',
      '1,2026-07-04,2026-07-04,Deposito en efectivo,,150.00,650.00',
      '1,2026-07-05,2026-07-05,Pago de servicio,50.00,,600.00',
    );

    expect(
      buildFinancialStatement(source({ extractorId: 'banco-nacion-v1', movementsCsv: withSigned })),
    ).toEqual(
      buildFinancialStatement(
        source({ extractorId: 'banco-nacion-v1', movementsCsv: withoutSigned }),
      ),
    );
  });

  it('con tipo de fila, deja fuera saldos, arrastres y totales', () => {
    const statement = buildFinancialStatement(
      source({
        extractorId: 'banco-nacion-v1',
        movementsCsv: csv(
          'Página,Tipo de fila,Fecha,Fecha valor,Descripción,Cargo/Abono,Cargos,Abonos,Saldo',
          '1,SALDO_ANTERIOR,,,SALDO ANTERIOR,,,,500.00',
          '1,MOVIMIENTO,2026-07-04,2026-07-04,Deposito en efectivo,150.00,,150.00,650.00',
          '1,SALDO_ARRASTRADO,,,VAN,,,,650.00',
          '2,MOVIMIENTO,2026-07-05,2026-07-05,Pago de servicio,-50.00,50.00,,600.00',
          '2,TOTAL_MOVIMIENTO,,,TOTALES,100.00,50.00,150.00,',
          '2,SALDO,,,SALDO FINAL,,,,600.00',
        ),
        summaryCsv: csv(
          'Archivo,Tipo de cuenta,Moneda,Páginas,Filas,Movimientos,Saldo inicial,Total abonos,Total cargos,Saldo final,Advertencias',
          'Julio.pdf,CORRIENTE,,2,6,2,500.00,150.00,50.00,600.00,0',
        ),
      }),
    );

    expect(statement.movimientos.map((movimiento) => movimiento.description)).toEqual([
      'Deposito en efectivo',
      'Pago de servicio',
    ]);
    // El documento no declara moneda: se muestra en soles, como siempre.
    expect(statement).toMatchObject({ tipoCuenta: 'CORRIENTE', moneda: 'PEN', saldoFinal: 60000 });
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
      archivo: null,
      moneda: null,
      tipoCuenta: null,
      saldoInicial: null,
      abonos: null,
      cargos: null,
      saldoFinal: null,
    });
  });

  it('lee la moneda solo cuando es una que se sabe mostrar', () => {
    expect(readSummary(INTERBANK_SUMMARY).moneda).toBe('PEN');
    expect(readSummary(BBVA_SUMMARY).moneda).toBe('USD');
    // BCP no la publicaba antes de esta versión del extractor.
    expect(readSummary(BCP_SUMMARY).moneda).toBeNull();
    expect(readSummary(csv('Moneda', 'EUR')).moneda).toBeNull();
  });

  it('lee el tipo de cuenta solo cuando es uno que se sabe agrupar', () => {
    expect(readSummary(BBVA_V2_SUMMARY).tipoCuenta).toBe('CORRIENTE');
    expect(readSummary(csv('Tipo de cuenta', 'ahorro')).tipoCuenta).toBe('AHORRO');
    expect(readSummary(csv('Tipo de cuenta', 'PLAZO FIJO')).tipoCuenta).toBeNull();
    expect(readSummary(BBVA_SUMMARY).tipoCuenta).toBeNull();
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

/** Hoja `Encabezado` como la publica el worker: pares `Campo`/`Valor`. Datos inventados. */
function encabezado(...fields: readonly (readonly [string, string])[]): string {
  return csv('Campo,Valor', ...fields.map(([field, value]) => `${field},${value}`));
}

describe('normalización: lo que se conserva de cada fila', () => {
  const BCP_V3_MOVEMENTS = csv(
    'Página,Tipo de fila,Fecha proceso,Fecha valor,Descripción,Cargo/Abono,Cargo,Abono,Saldo',
    '1,SALDO_ANTERIOR,,,SALDO ANTERIOR,,,,1000.00',
    '1,MOVIMIENTO,2025-12-31,2025-12-31,YAPE recibido tarde,25.00,,25.00,1025.00',
    '2,MOVIMIENTO,2026-01-05,2026-01-06,PAGO SUNAT,-200.00,200.00,,825.00',
    '2,MOVIMIENTO,2026-01-09,2026-01-09,TRANSFERENCIA A TERCEROS,-100.00,100.00,,725.00',
    '2,SALDO,,,SALDO FINAL,,,,725.00',
  );
  const BCP_V3_HEADER = encabezado(
    ['Banco', 'BCP'],
    ['Titular', 'PERSONA DE PRUEBA'],
    ['Código de cuenta', '191-00000012-3-45'],
    ['Moneda', 'Soles'],
    ['Periodo', 'DEL 31/12/25 AL 31/01/26'],
    ['Fecha inicio', '31/12/2025'],
    ['Fecha fin', '31/01/2026'],
  );
  const statement = buildFinancialStatement(
    source({
      jobId: 'job-ene',
      movementsCsv: BCP_V3_MOVEMENTS,
      headerCsv: BCP_V3_HEADER,
      documentName: 'Enero.pdf',
      status: 'NEEDS_REVIEW',
      extractorVersion: '0.5.3',
    }),
  );

  it('separa cargo y abono, conserva el saldo impreso, la fecha valor y la fila de origen', () => {
    expect(statement.movimientos[1]).toMatchObject({
      statementId: 'job-ene',
      date: '2026-01-05',
      valueDate: '2026-01-06',
      debitCents: 20000,
      creditCents: 0,
      type: 'CARGO',
      amountCents: 20000,
      balanceCents: 82500,
      issues: [],
      source: { page: 2, row: 3 },
    });
  });

  it('dice qué fecha es la principal: BCP imprime la de proceso', () => {
    expect(statement.tipoFecha).toBe('PROCESO');
  });

  it('identifica la cuenta sin guardar su número ni nada del titular', () => {
    expect(statement.cuenta?.terminacion).toBe('2345');
    expect(statement.cuenta?.clave).toMatch(/^[0-9a-f]{8}$/);
    const serialized = JSON.stringify(statement);
    expect(serialized).not.toContain('00000012');
    expect(serialized).not.toContain('PERSONA DE PRUEBA');
  });

  it('el periodo declarado cruza el año; el mes del documento sigue siendo enero', () => {
    expect(statement.periodoDeclarado).toEqual({ start: '2025-12-31', end: '2026-01-31' });
    expect(statement.fechaPeriodo).toBe('2026-01');
    // El 31 de diciembre está dentro del periodo `DEL 31/12/25`: no se marca.
    expect(statement.movimientos.every((movement) => !movement.outsidePeriod)).toBe(true);
  });

  it('conserva nombre, estado y versión del documento', () => {
    expect(statement).toMatchObject({
      nombreDocumento: 'Enero.pdf',
      estado: 'NEEDS_REVIEW',
      versionExtractor: '0.5.3',
      monedaDeclarada: false,
    });
  });

  it('marca la fecha que cae fuera del periodo que declara el banco', () => {
    const late = buildFinancialStatement(
      source({
        movementsCsv: BCP_V3_MOVEMENTS,
        headerCsv: encabezado(['Fecha inicio', '01/01/2026'], ['Fecha fin', '31/01/2026']),
      }),
    );
    expect(late.movimientos.map((movement) => movement.outsidePeriod)).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe('normalización: importes que no cuadran entre sí', () => {
  it('si `Cargo/Abono` contradice las columnas separadas, mandan estas y se señala', () => {
    const statement = buildFinancialStatement(
      source({
        movementsCsv: csv(
          'Fecha proceso,Descripción,Cargo/Abono,Cargo,Abono,Saldo',
          '2026-01-05,Pago,100.00,100.00,,900.00',
        ),
      }),
    );
    expect(statement.movimientos[0]).toMatchObject({
      debitCents: 10000,
      creditCents: 0,
      type: 'CARGO',
      issues: ['SIGNO_INCONSISTENTE'],
    });
  });

  it('un cargo impreso con signo se toma por su magnitud y se señala, sin volverlo abono', () => {
    const statement = buildFinancialStatement(
      source({
        movementsCsv: csv(
          'Fecha proceso,Descripción,Cargo/Abono,Cargo,Abono',
          '2026-01-05,Pago,200.00,-200.00,',
        ),
      }),
    );
    expect(statement.movimientos[0]).toMatchObject({
      debitCents: 20000,
      type: 'CARGO',
      issues: ['IMPORTE_NEGATIVO', 'SIGNO_INCONSISTENTE'],
    });
  });

  it('una fila con cargo y abono a la vez los conserva por separado; el neto da el tipo', () => {
    const statement = buildFinancialStatement(
      source({
        movementsCsv: csv(
          'Fecha proceso,Descripción,Cargo/Abono,Cargo,Abono',
          '2026-01-05,Abono con comisión,90.00,10.00,100.00',
        ),
      }),
    );
    expect(statement.movimientos[0]).toMatchObject({
      debitCents: 1000,
      creditCents: 10000,
      type: 'ABONO',
      amountCents: 9000,
      issues: [],
    });
  });
});

describe('normalización por banco', () => {
  it('BBVA: fecha de operación; el ITF lleva el saldo impreso y no se cuenta dos veces', () => {
    const statement = buildFinancialStatement(
      source({ extractorId: 'bbva-account-v1', movementsCsv: BBVA_MOVEMENTS }),
    );
    expect(statement.tipoFecha).toBe('OPERACION');
    const [abono, itf] = statement.movimientos;
    expect(abono).toMatchObject({ creditCents: 50000, debitCents: 0, balanceCents: null });
    expect(itf).toMatchObject({ debitCents: 2, creditCents: 0, balanceCents: 149998 });
    const debits = statement.movimientos.reduce(
      (total, movement) => total + movement.debitCents,
      0,
    );
    expect(debits).toBe(statement.cargos);
  });

  it('Interbank: «Fecha» sin decir cuál, sin fecha valor; Ingresos y Gastos son abono y cargo', () => {
    const statement = buildFinancialStatement(
      source({
        extractorId: 'interbank-savings-v1',
        movementsCsv: INTERBANK_MOVEMENTS,
        summaryCsv: INTERBANK_SUMMARY,
        headerCsv: encabezado(
          ['Número de cuenta', '200-3000111222'],
          ['Periodo', '01/08/2026 al 31/08/2026'],
        ),
      }),
    );
    expect(statement.tipoFecha).toBe('NO_DECLARADA');
    expect(statement.movimientos[0]).toMatchObject({ creditCents: 30000, valueDate: null });
    expect(statement.movimientos[1]).toMatchObject({ debitCents: 5000 });
    expect(statement.cuenta?.terminacion).toBe('1222');
    expect(statement.periodoDeclarado).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });

  it('Banco de la Nación: número de cuenta del encabezado y fecha valor', () => {
    const statement = buildFinancialStatement(
      source({
        extractorId: 'banco-nacion-v1',
        movementsCsv: NACION_MOVEMENTS,
        headerCsv: encabezado(['Número de cuenta', '04-000-111111']),
      }),
    );
    expect(statement.cuenta?.terminacion).toBe('1111');
    expect(statement.periodoDeclarado).toBeNull();
    expect(statement.movimientos[0]?.valueDate).toBe('2026-07-04');
  });

  it('genérico: sin encabezado ni moneda, la cuenta queda sin identificar y la moneda supuesta', () => {
    const statement = buildFinancialStatement(
      source({ extractorId: 'generic-table-v1', movementsCsv: GENERIC_MOVEMENTS }),
    );
    expect(statement).toMatchObject({
      cuenta: null,
      monedaDeclarada: false,
      moneda: 'PEN',
      periodoDeclarado: null,
      tipoFecha: 'NO_DECLARADA',
    });
    expect(statement.movimientos[0]?.balanceCents).toBeNull();
  });
});
