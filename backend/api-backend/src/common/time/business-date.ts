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

/**
 * `dia` más `meses` meses, con el día recortado al último del mes cuando no
 * existe: el 31 de enero más un mes es el 28 (o 29) de febrero. Se calcula
 * siempre desde el mismo `dia`, así que el 31 de enero más dos meses vuelve a
 * ser el 31 de marzo, no el 28.
 */
export function addMonthsToIsoDate(dia: string, meses: number): string {
  const [anio, mes, diaDelMes] = dia.split('-').map(Number) as [number, number, number];
  const indice = anio * 12 + (mes - 1) + meses;
  const anioNuevo = Math.floor(indice / 12);
  const mesNuevo = indice - anioNuevo * 12;
  const ultimo = new Date(Date.UTC(anioNuevo, mesNuevo + 1, 0)).getUTCDate();
  const fecha = new Date(Date.UTC(anioNuevo, mesNuevo, Math.min(diaDelMes, ultimo)));
  return toIsoDate(fecha);
}

/** Diferencia entre la hora local de esa zona y UTC en ese instante, en milisegundos. */
function desfase(instante: number, timeZone: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instante));
  const valor = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? 0);
  const comoUtc = Date.UTC(
    valor('year'),
    valor('month') - 1,
    valor('day'),
    valor('hour'),
    valor('minute'),
    valor('second'),
  );
  return comoUtc - Math.floor(instante / 1000) * 1000;
}

/**
 * El instante en que empieza `dia` en esa zona horaria: la medianoche de Lima del
 * 26 de noviembre es `2026-11-26T05:00:00Z`. Dos pasadas por si la zona cambia de
 * horario justo ese día (Lima no lo hace, pero la zona es configurable).
 */
export function startOfBusinessDay(dia: string, timeZone: string): Date {
  const medianocheUtc = fromIsoDate(dia).getTime();
  const primero = medianocheUtc - desfase(medianocheUtc, timeZone);
  const segundo = medianocheUtc - desfase(primero, timeZone);
  return new Date(segundo);
}

/** `dia` más `dias` días de calendario. */
export function addDaysToIsoDate(dia: string, dias: number): string {
  const fecha = fromIsoDate(dia);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return toIsoDate(fecha);
}
