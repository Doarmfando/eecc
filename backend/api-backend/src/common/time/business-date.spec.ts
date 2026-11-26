import {
  addDaysToIsoDate,
  addMonthsToIsoDate,
  businessToday,
  fromIsoDate,
  isExpired,
  isValidIsoDate,
  isValidTimeZone,
  startOfBusinessDay,
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

describe('addMonthsToIsoDate', () => {
  it('suma meses y recorta el día al último del mes cuando no existe', () => {
    expect(addMonthsToIsoDate('2026-11-26', 1)).toBe('2026-12-26');
    expect(addMonthsToIsoDate('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonthsToIsoDate('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsToIsoDate('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('siempre cuenta desde el día original: el 31 vuelve a ser 31 cuando existe', () => {
    expect(addMonthsToIsoDate('2027-01-31', 2)).toBe('2027-03-31');
    expect(addMonthsToIsoDate('2027-01-31', 0)).toBe('2027-01-31');
    expect(addMonthsToIsoDate('2027-03-31', -1)).toBe('2027-02-28');
  });
});

describe('startOfBusinessDay', () => {
  it('es la medianoche de esa zona, no la de UTC', () => {
    expect(startOfBusinessDay('2026-11-26', 'America/Lima').toISOString()).toBe(
      '2026-11-26T05:00:00.000Z',
    );
    expect(startOfBusinessDay('2026-11-26', 'UTC').toISOString()).toBe('2026-11-26T00:00:00.000Z');
  });

  it('respeta un cambio de horario en una zona que sí lo tiene', () => {
    // Madrid pasa a horario de verano el 29 de marzo de 2026: ese día empieza en UTC+1.
    expect(startOfBusinessDay('2026-03-29', 'Europe/Madrid').toISOString()).toBe(
      '2026-03-28T23:00:00.000Z',
    );
    expect(startOfBusinessDay('2026-07-01', 'Europe/Madrid').toISOString()).toBe(
      '2026-06-30T22:00:00.000Z',
    );
  });
});

describe('addDaysToIsoDate', () => {
  it('suma días de calendario cruzando meses y años bisiestos', () => {
    expect(addDaysToIsoDate('2026-11-26', 90)).toBe('2027-02-24');
    expect(addDaysToIsoDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToIsoDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});
