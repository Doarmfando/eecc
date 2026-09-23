import { describe, expect, it } from 'vitest';

import { normalizeHeader, parseCsv, readCell, readCsvTable } from './csv';

describe('parseCsv', () => {
  it('lee filas separadas por CRLF, como las escribe el worker', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('quita el BOM de utf-8-sig para no pegarlo a la primera cabecera', () => {
    const [header] = parseCsv('﻿Página,Fecha\r\n');
    expect(header?.[0]).toBe('Página');
  });

  it('respeta comas y saltos dentro de un campo entrecomillado', () => {
    expect(parseCsv('a,"uno, dos\nтres",c\r\n')).toEqual([['a', 'uno, dos\nтres', 'c']]);
  });

  it('interpreta las comillas duplicadas como una comilla literal', () => {
    expect(parseCsv('"dice ""hola""",1\r\n')).toEqual([['dice "hola"', '1']]);
  });

  it('conserva los campos vacíos, que son importes ausentes', () => {
    expect(parseCsv('1,,3\r\n')).toEqual([['1', '', '3']]);
  });

  it('no inventa una fila final cuando el archivo termina en salto', () => {
    expect(parseCsv('a\r\nb\r\n')).toHaveLength(2);
  });
});

describe('normalizeHeader', () => {
  it('ignora acentos y mayúsculas', () => {
    expect(normalizeHeader(' Descripción ')).toBe('descripcion');
    expect(normalizeHeader('PÁGINA')).toBe('pagina');
  });
});

describe('readCsvTable', () => {
  const csv = 'Fecha,Descripción,Cargo\r\n2026-09-01,Pago,10.00\r\n,,\r\n';

  it('indexa la cabecera y descarta las filas totalmente vacías', () => {
    const table = readCsvTable(csv);
    expect(table.columns.get('descripcion')).toBe(1);
    expect(table.rows).toHaveLength(1);
  });

  it('devuelve una tabla vacía si no hay cabecera', () => {
    expect(readCsvTable('').rows).toEqual([]);
  });
});

describe('readCell', () => {
  it('usa el primer rótulo que exista, porque cada extractor nombra distinto', () => {
    const table = readCsvTable('Fecha,Concepto,Ingresos\r\n2026-09-01,Abono,25.50\r\n');
    const row = table.rows[0] ?? [];

    expect(readCell(table, row, 'Descripción', 'Concepto')).toBe('Abono');
    expect(readCell(table, row, 'Abono', 'Abonos', 'Ingresos')).toBe('25.50');
    expect(readCell(table, row, 'Tipo de fila')).toBe('');
  });
});
