import { describe, expect, it } from 'vitest';

import { readAccount, readAccountHeader, readPeriod } from './account-header';

describe('readAccount', () => {
  it('distingue dos cuentas que terminan igual', () => {
    const a = readAccount('191-11111111-0-12');
    const b = readAccount('191-22222221-0-12');
    expect(a?.terminacion).toBe('1012');
    expect(b?.terminacion).toBe('1012');
    expect(a?.clave).not.toBe(b?.clave);
  });

  it('la misma cuenta escrita con otros separadores es la misma', () => {
    expect(readAccount('191 1111 1111 012')?.clave).toBe(readAccount('191-1111-1111-012')?.clave);
  });

  it('un valor demasiado corto o vacío no identifica una cuenta', () => {
    expect(readAccount('')).toBeNull();
    expect(readAccount('12-3')).toBeNull();
  });
});

describe('readPeriod', () => {
  it('prefiere las fechas separadas y entiende años de dos cifras en el texto', () => {
    expect(readPeriod('01/02/2026', '28/02/2026', 'DEL 31/12/25 AL 31/01/26')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
    expect(readPeriod('', '', 'DEL 31/12/25 AL 31/01/26')).toEqual({
      start: '2025-12-31',
      end: '2026-01-31',
    });
  });

  it('no inventa un periodo ilegible, invertido o con fechas imposibles', () => {
    expect(readPeriod('', '', 'AGOSTO 2026')).toBeNull();
    expect(readPeriod('', '', 'DEL 31/01/26 AL 01/01/26')).toBeNull();
    expect(readPeriod('', '', 'DEL 31/02/26 AL 28/03/26')).toBeNull();
  });
});

describe('readAccountHeader', () => {
  it('sin hoja `Encabezado` no hay cuenta ni periodo', () => {
    expect(readAccountHeader(null)).toEqual({ cuenta: null, periodo: null });
  });

  it('el CCI no se toma por número de cuenta', () => {
    const header = readAccountHeader('Campo,Valor\r\nCCI,011-000-000000000000-00\r\n');
    expect(header.cuenta).toBeNull();
  });
});
