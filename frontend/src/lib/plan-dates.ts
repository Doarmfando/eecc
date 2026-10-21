/**
 * Fechas de vigencia de una membresía (`YYYY-MM-DD`, sin horas). La API decide
 * si ya venció con el día del negocio; aquí solo se muestran y se proponen.
 */

/** Días antes del vencimiento en que se avisa. */
export const DIAS_DE_AVISO = 7;

const DIA = 24 * 60 * 60 * 1000;

function aFecha(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

function aDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Hoy en el navegador: quien administra está en la misma zona que el negocio. */
export function hoyLocal(ahora: Date = new Date()): string {
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${String(ahora.getFullYear())}-${mes}-${dia}`;
}

/** Suma meses sin pasarse de mes: 31 de enero + 1 mes es 28 o 29 de febrero. */
export function sumarMeses(dia: string, meses: number): string {
  const fecha = aFecha(dia);
  const objetivo = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + meses, 1));
  const ultimoDia = new Date(
    Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  objetivo.setUTCDate(Math.min(fecha.getUTCDate(), ultimoDia));
  return aDia(objetivo);
}

/** Días desde `hoy` hasta `dia`; negativos si ya pasó. */
export function diasHasta(dia: string, hoy: string): number {
  return Math.round((aFecha(dia).getTime() - aFecha(hoy).getTime()) / DIA);
}

/** «20 nov. 2026». Se formatea en UTC para no correr el día por la zona horaria. */
export function formatearDia(dia: string): string {
  return aFecha(dia).toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export type EstadoDeVigencia = 'sin-vencimiento' | 'vigente' | 'por-vencer' | 'vencida';

/**
 * Cómo está una vigencia hoy. `vencida` lo puede afirmar la API (`expired`), que
 * cuenta con el día del negocio; si no lo dice, se deduce de la fecha.
 */
export function estadoDeVigencia(
  expiresOn: string | null | undefined,
  hoy: string,
  vencidaSegunApi?: boolean,
): EstadoDeVigencia {
  if (!expiresOn) {
    return 'sin-vencimiento';
  }
  const dias = diasHasta(expiresOn, hoy);
  if (vencidaSegunApi ?? dias < 0) {
    return 'vencida';
  }
  return dias <= DIAS_DE_AVISO ? 'por-vencer' : 'vigente';
}

/** «Vence hoy», «Vence mañana», «Vence en 5 días», «Vence el 20 nov. 2026», «Venció el …». */
export function describirVigencia(expiresOn: string, hoy: string, vencida?: boolean): string {
  const dias = diasHasta(expiresOn, hoy);
  if (vencida ?? dias < 0) {
    return `Venció el ${formatearDia(expiresOn)}`;
  }
  if (dias === 0) {
    return 'Vence hoy';
  }
  if (dias === 1) {
    return 'Vence mañana';
  }
  return dias <= DIAS_DE_AVISO
    ? `Vence en ${String(dias)} días`
    : `Vence el ${formatearDia(expiresOn)}`;
}
