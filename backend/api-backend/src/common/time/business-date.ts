/**
 * Fechas de calendario del negocio, sin horas.
 *
 * Una vigencia «hasta el 20 de noviembre» se cumple ese día en Lima, no a las
 * 19:00 de Lima porque el servidor corra en UTC. Por eso «hoy» se calcula en la
 * zona del negocio (`BUSINESS_TIMEZONE`) y las fechas viajan como `YYYY-MM-DD`.
 */

const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` del día actual en esa zona horaria. */
export function businessToday(timeZone: string, ahora: Date = new Date()): string {
  // `en-CA` escribe las fechas como `2026-10-20`, que es justo el formato ISO.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** Si el runtime conoce la zona horaria; una errata no debe fallar a medianoche. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Una columna `@db.Date` llega como medianoche UTC: su día es el de la fecha ISO. */
export function toIsoDate(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Lo contrario de `toIsoDate`, para escribir en una columna `@db.Date`. */
export function fromIsoDate(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

/** `2026-02-30` tiene el formato pero no existe: se rechaza igual. */
export function isValidIsoDate(dia: string): boolean {
  const partes = FORMATO_ISO.exec(dia);
  if (!partes) {
    return false;
  }
  const fecha = fromIsoDate(dia);
  return !Number.isNaN(fecha.getTime()) && toIsoDate(fecha) === dia;
}

/** Vencida si su último día de vigencia ya pasó. El mismo día todavía vale. */
export function isExpired(expiresOn: string | null, today: string): boolean {
  return expiresOn !== null && expiresOn < today;
}
