import { describe, expect, it } from 'vitest';

import { buildCalendarCells } from './calendar-grid';

describe('buildCalendarCells', () => {
  it('rellena la cuadrícula a múltiplos de 7 y numera los días reales', () => {
    const cells = buildCalendarCells('2026-09');
    expect(cells.length % 7).toBe(0);

    const realDays = cells.filter((cell) => cell !== null);
    expect(realDays).toHaveLength(30);
    expect(realDays[0]).toEqual({ date: '2026-09-01', dayNumber: 1 });
    expect(realDays[29]).toEqual({ date: '2026-09-30', dayNumber: 30 });
  });
});
