import {
  artifactName,
  readChecks,
  readWarningPages,
  toJobResponse,
  warningRows,
} from './job-response.mapper';

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

describe('warningRows', () => {
  it('una fila por aviso y, si se puede ubicar, una por página', () => {
    expect(
      warningRows(
        ['BCP_BALANCE_MISMATCH', 'BCP_PAGE_INCOMPLETE'],
        [
          { code: 'BCP_PAGE_INCOMPLETE', page: 424 },
          { code: 'BCP_PAGE_INCOMPLETE', page: 12 },
        ],
      ),
    ).toEqual([
      { code: 'BCP_BALANCE_MISMATCH', page: null },
      { code: 'BCP_PAGE_INCOMPLETE', page: 424 },
      { code: 'BCP_PAGE_INCOMPLETE', page: 12 },
    ]);
  });

  it('no repite filas e ignora páginas de un código que no se reportó', () => {
    expect(
      warningRows(
        ['BCP_PAGE_INCOMPLETE', 'BCP_PAGE_INCOMPLETE'],
        [
          { code: 'BCP_PAGE_INCOMPLETE', page: 3 },
          { code: 'BCP_PAGE_INCOMPLETE', page: 3 },
          { code: 'OTRO', page: 9 },
        ],
      ),
    ).toEqual([{ code: 'BCP_PAGE_INCOMPLETE', page: 3 }]);
    // Un worker anterior no manda páginas: se guarda como siempre.
    expect(warningRows(['BCP_BALANCE_MISMATCH'])).toEqual([
      { code: 'BCP_BALANCE_MISMATCH', page: null },
    ]);
  });
});

describe('readWarningPages', () => {
  it('devuelve solo los avisos con página, en el orden del documento', () => {
    expect(
      readWarningPages([
        { code: 'BCP_PAGE_INCOMPLETE', page: 424 },
        { code: 'BCP_BALANCE_MISMATCH', page: null },
        { code: 'BCP_PAGE_INCOMPLETE', page: 12 },
        { code: 'SIN_PAGINA' },
      ]),
    ).toEqual([
      { code: 'BCP_PAGE_INCOMPLETE', page: 12 },
      { code: 'BCP_PAGE_INCOMPLETE', page: 424 },
    ]);
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
      createdAt: new Date('2026-10-17T05:30:00.000Z'),
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
      warningPages: [],
      extractorId: '',
      extractorVersion: '',
      rowCount: 0,
      movementCount: 0,
      pageCount: 0,
      checks: [],
      artifacts: [],
    });
  });

  it('un aviso en varias páginas es un solo código con todas sus páginas', () => {
    const response = toJobResponse({
      jobId: 'job-id',
      statementId: 'statement-id',
      createdAt: new Date('2026-10-21T05:30:00.000Z'),
      status: 'NEEDS_REVIEW',
      reused: false,
      attempt: {
        attemptNumber: 1,
        extractorId: 'bcp-coordinate-v1',
        extractorVersion: '0.5.1',
        rowCount: 10,
        movementCount: 8,
        pageCount: 30,
        checks: null,
        warnings: [
          { code: 'BCP_BALANCE_MISMATCH', page: null },
          { code: 'BCP_PAGE_INCOMPLETE', page: 20 },
          { code: 'BCP_PAGE_INCOMPLETE', page: 7 },
        ],
        artifacts: [],
      },
    });

    expect(response.warningCodes).toEqual(['BCP_BALANCE_MISMATCH', 'BCP_PAGE_INCOMPLETE']);
    expect(response.warningPages).toEqual([
      { code: 'BCP_PAGE_INCOMPLETE', page: 7 },
      { code: 'BCP_PAGE_INCOMPLETE', page: 20 },
    ]);
  });
});
