import {
  businessToday,
  fromIsoDate,
  isExpired,
  isValidIsoDate,
  isValidTimeZone,
  toIsoDate,
} from './business-date';

describe('business-date', () => {
  it('calcula hoy en la zona del negocio, no en la del servidor', () => {
    // 21 oct. 02:00 UTC es todavía 20 oct. 21:00 en Lima.
    const instante = new Date('2026-10-21T02:00:00.000Z');
    expect(businessToday('America/Lima', instante)).toBe('2026-10-20');
    expect(businessToday('UTC', instante)).toBe('2026-10-21');
  });

  it('reconoce zonas horarias válidas', () => {
    expect(isValidTimeZone('America/Lima')).toBe(true);
    expect(isValidTimeZone('Marte/Olympus')).toBe(false);
  });

  it('convierte una columna de fecha sin perder el día', () => {
    expect(toIsoDate(fromIsoDate('2026-11-20'))).toBe('2026-11-20');
  });

  it('solo admite fechas que existen', () => {
    expect(isValidIsoDate('2026-11-20')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('20/11/2026')).toBe(false);
  });

  it('vence al día siguiente del último día de vigencia', () => {
    expect(isExpired('2026-10-20', '2026-10-20')).toBe(false);
    expect(isExpired('2026-10-19', '2026-10-20')).toBe(true);
    expect(isExpired(null, '2026-10-20')).toBe(false);
  });
});
