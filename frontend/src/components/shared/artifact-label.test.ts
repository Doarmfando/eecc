import { describe, expect, it } from 'vitest';

import { describeArtifact, savedFileName } from './artifact-label';

const SERVER = 'job-1.xlsx';

describe('savedFileName', () => {
  it('nombra el Excel, el PDF y cada CSV como el PDF que se subió', () => {
    const source = 'Agosto BBVA ahorro.pdf';
    expect(savedFileName({ kind: 'RESULT_XLSX', name: 'statement.xlsx' }, source, SERVER)).toBe(
      'Agosto BBVA ahorro.xlsx',
    );
    expect(savedFileName({ kind: 'SOURCE_PDF', name: 'source.pdf' }, source, SERVER)).toBe(
      'Agosto BBVA ahorro.pdf',
    );
    expect(
      savedFileName({ kind: 'RESULT_CSV', name: 'statement_Movimientos.csv' }, source, SERVER),
    ).toBe('Agosto BBVA ahorro_Movimientos.csv');
  });

  it('respeta mayúsculas y acentos, y solo quita la extensión .pdf', () => {
    const artifact = { kind: 'RESULT_XLSX', name: 'statement.xlsx' };
    expect(savedFileName(artifact, 'Estado Señor Núñez.PDF', SERVER)).toBe(
      'Estado Señor Núñez.xlsx',
    );
    expect(savedFileName(artifact, 'estado.v2', SERVER)).toBe('estado.v2.xlsx');
  });

  it('reemplaza lo que el sistema de archivos no admite', () => {
    expect(
      savedFileName({ kind: 'RESULT_XLSX', name: 'statement.xlsx' }, 'a:b*c?.pdf', SERVER),
    ).toBe('a_b_c_.xlsx');
  });

  it('usa el nombre del servidor cuando no hay de dónde sacar otro', () => {
    const artifact = { kind: 'RESULT_XLSX', name: 'statement.xlsx' };
    expect(savedFileName(artifact, null, SERVER)).toBe(SERVER);
    expect(savedFileName(artifact, '.pdf', SERVER)).toBe(SERVER);
    expect(savedFileName({ kind: 'TECHNICAL_MANIFEST', name: 'm.json' }, 'a.pdf', SERVER)).toBe(
      SERVER,
    );
  });
});

describe('describeArtifact', () => {
  it('nombra la hoja del encabezado', () => {
    expect(describeArtifact('RESULT_CSV', 'statement_Encabezado.csv')).toBe(
      'CSV derivado · Encabezado',
    );
  });
});
