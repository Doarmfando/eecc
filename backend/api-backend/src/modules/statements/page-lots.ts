/**
 * Reglas del saldo de páginas en lotes (ADR-0019), sin base de datos.
 *
 * `StatementUsageService` lee los lotes y sus asignaciones y aplica estas
 * funciones; aquí está todo lo que decide cuánto queda, de qué lote se gasta y
 * qué periodo corre, para poder probarlo sin Postgres.
 */

import { addMonthsToIsoDate } from '../../common/time/business-date';

export const FUENTE = {
  TRIAL: 'TRIAL',
  MEMBERSHIP_PERIOD: 'MEMBERSHIP_PERIOD',
  PURCHASE: 'PURCHASE',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type FuenteDeLote = (typeof FUENTE)[keyof typeof FUENTE];

/** Clave que impide crear dos veces la prueba de una persona. */
export const CLAVE_DE_PRUEBA = 'TRIAL';

/** Clave del lote de un periodo: el día en que empieza. */
export function claveDePeriodo(inicio: string): string {
  return `PERIOD:${inicio}`;
}

/** Un lote con lo que ya se gastó y lo que está apartado por subidas en curso. */
export interface LoteConSaldo {
  /** Nulo: todavía no existe; se crea al primer uso (solo prueba y periodo). */
  id: string | null;
  source: FuenteDeLote;
  quantity: number;
  /** Consumido: lo traído de antes de los lotes más lo confirmado por subidas. */
  consumed: number;
  /** Apartado por subidas que todavía no terminan. */
  held: number;
  startsAt: Date;
  /** Nulo: no vence. */
  expiresAt: Date | null;
  createdAt: Date;
}

export function disponible(lote: Pick<LoteConSaldo, 'quantity' | 'consumed' | 'held'>): number {
  return Math.max(0, lote.quantity - lote.consumed - lote.held);
}

/** Lo que queda sin contar lo apartado: si esto es positivo y `disponible` no, hay que esperar. */
export function sinConsumir(lote: Pick<LoteConSaldo, 'quantity' | 'consumed'>): number {
  return Math.max(0, lote.quantity - lote.consumed);
}

/**
 * FEFO: primero el que vence antes; los que no vencen, al final. A igual
 * vencimiento, el más antiguo. El `id` desempata para que el orden sea estable.
 */
type Ordenable = Pick<LoteConSaldo, 'expiresAt' | 'startsAt' | 'id'> & {
  /** Nulo: todavía no existe, va después de los ya creados con igual vencimiento. */
  createdAt: Date | null;
};

export function compararFefo(a: Ordenable, b: Ordenable): number {
  const venceA = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const venceB = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (venceA !== venceB) {
    return venceA < venceB ? -1 : 1;
  }
  if (a.startsAt.getTime() !== b.startsAt.getTime()) {
    return a.startsAt.getTime() - b.startsAt.getTime();
  }
  const creadoA = a.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const creadoB = b.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (creadoA !== creadoB) {
    return creadoA < creadoB ? -1 : 1;
  }
  return (a.id ?? '').localeCompare(b.id ?? '');
}

/**
 * Reparte `paginas` entre los lotes en orden FEFO, sin pasar de lo disponible en
 * cada uno. Devuelve solo los lotes que aportan; si no alcanza, reparte lo que
 * hay (quien llama decide antes el techo con `disponible`).
 */
export function repartirFefo<T extends LoteConSaldo & { id: string }>(
  lotes: readonly T[],
  paginas: number,
): { lote: T; pages: number }[] {
  const reparto: { lote: T; pages: number }[] = [];
  let falta = paginas;
  for (const lote of [...lotes].sort(compararFefo)) {
    if (falta <= 0) {
      break;
    }
    const toma = Math.min(disponible(lote), falta);
    if (toma > 0) {
      reparto.push({ lote, pages: toma });
      falta -= toma;
    }
  }
  return reparto;
}

/**
 * Lo que de verdad consumió una subida, repartido entre lo que había apartado
 * en cada lote, otra vez en orden FEFO: si el PDF trajo menos páginas que el
 * techo, lo que sobra vuelve primero a los lotes que vencen después.
 *
 * `asignaciones` ya viene en orden FEFO. Nunca pasa de lo apartado en cada una:
 * el worker no devuelve más páginas que el techo que se le envió.
 */
export function distribuirConsumo<T extends { reservedPages: number }>(
  asignaciones: readonly T[],
  paginas: number,
): { asignacion: T; consumed: number }[] {
  let falta = Math.max(0, paginas);
  return asignaciones.map((asignacion) => {
    const consumed = Math.min(asignacion.reservedPages, falta);
    falta -= consumed;
    return { asignacion, consumed };
  });
}

/**
 * Periodo mensual que corre `hoy` para una membresía anclada en `ancla` (días
 * `YYYY-MM-DD` del negocio). Cada periodo empieza el mismo día del mes que el
 * ancla, recortado al último día cuando ese mes es más corto, y termina donde
 * empieza el siguiente. `fin` es exclusivo.
 */
export function periodoVigente(ancla: string, hoy: string): { inicio: string; fin: string } {
  if (hoy < ancla) {
    return { inicio: ancla, fin: addMonthsToIsoDate(ancla, 1) };
  }
  const [anioA, mesA] = ancla.split('-').map(Number) as [number, number];
  const [anioH, mesH] = hoy.split('-').map(Number) as [number, number];
  // Estimación por meses de calendario; como mucho sobra uno, que se corrige.
  let meses = (anioH - anioA) * 12 + (mesH - mesA);
  if (addMonthsToIsoDate(ancla, meses) > hoy) {
    meses -= 1;
  }
  return {
    inicio: addMonthsToIsoDate(ancla, meses),
    fin: addMonthsToIsoDate(ancla, meses + 1),
  };
}
