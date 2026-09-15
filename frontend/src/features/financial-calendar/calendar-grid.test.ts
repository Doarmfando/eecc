import { describe, expect, it } from 'vitest';

import { buildCalendarCells, CALENDAR_CELL_COUNT } from './calendar-grid';

describe('buildCalendarCells', () => {
  it('arma seis semanas de lunes a domingo y marca los días ajenos al mes', () => {
    const cells = buildCalendarCells('2026-09');
    expect(cells).toHaveLength(CALENDAR_CELL_COUNT);

    // Setiembre de 2026 empieza en martes: el lunes 31 de agosto abre la cuadrícula.
    expect(cells[0]).toEqual({ date: '2026-08-31', dayNumber: 31, inMonth: false });
    expect(cells[1]).toEqual({ date: '2026-09-01', dayNumber: 1, inMonth: true });
    expect(cells[30]).toEqual({ date: '2026-09-30', dayNumber: 30, inMonth: true });
    expect(cells[41]).toEqual({ date: '2026-10-11', dayNumber: 11, inMonth: false });
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(30);
  });

  it('cruza el cambio de año en ambos extremos', () => {
    // 1 de enero de 2027 cae en viernes.
    const cells = buildCalendarCells('2027-01');
    expect(cells[0]).toEqual({ date: '2026-12-28', dayNumber: 28, inMonth: false });
    expect(cells[4]).toEqual({ date: '2027-01-01', dayNumber: 1, inMonth: true });
  });
});
