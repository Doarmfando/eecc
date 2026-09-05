import { artifactName, readChecks, toJobResponse } from './job-response.mapper';

describe('readChecks', () => {
  it('acepta solo elementos con código y estado textuales', () => {
    expect(
      readChecks([
        { code: 'BCP_ROWS_PRESENT', status: 'PASSED' },
        { code: 'BCP_PAGE_TOTALS', status: 'FAILED', extra: 'ignorado' },
      ]),
    ).toEqual([
      { code: 'BCP_ROWS_PRESENT', status: 'PASSED' },
      { code: 'BCP_PAGE_TOTALS', status: 'FAILED' },
    ]);
  });

  it('descarta formas inesperadas en lugar de confiar en el jsonb almacenado', () => {
    expect(readChecks(null)).toEqual([]);
    expect(readChecks('texto')).toEqual([]);
    expect(readChecks({ code: 'X', status: 'PASSED' })).toEqual([]);
    expect(readChecks([null, 'texto', ['anidado'], { code: 1, status: 'PASSED' }, {}])).toEqual([]);
  });
});

describe('artifactName', () => {
  it('toma el último segmento de la clave de objeto', () => {
    expect(artifactName('worker/org/job/statement_Movimientos.csv')).toBe(
      'statement_Movimientos.csv',
    );
    expect(artifactName('organizations/o/statements/s/8f2c.pdf')).toBe('8f2c.pdf');
  });

  it('devuelve la clave completa cuando no tiene segmentos', () => {
    expect(artifactName('suelto.xlsx')).toBe('suelto.xlsx');
    expect(artifactName('')).toBe('');
  });
});

describe('toJobResponse', () => {
  it('presenta un intento fallido con ceros, no con nulos', () => {
    const response = toJobResponse({
      jobId: 'job-id',
      statementId: 'statement-id',
      status: 'FAILED',
      reused: false,
      attempt: {
        attemptNumber: 2,
        extractorId: null,
        extractorVersion: null,
        rowCount: null,
        movementCount: null,
        pageCount: null,
        checks: null,
        warnings: [],
        artifacts: [],
      },
    });

    expect(response).toMatchObject({
      status: 'FAILED',
      extractorId: '',
      extractorVersion: '',
      rowCount: 0,
      movementCount: 0,
      pageCount: 0,
      checks: [],
      artifacts: [],
    });
  });
});
