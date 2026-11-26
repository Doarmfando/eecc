/**
 * Saldo de páginas en lotes (ADR-0019), tal como lo devuelve la API: la prueba
 * gratuita, el periodo de la membresía y cada compra, con lo que queda en cada
 * uno y en el orden en que se gastan (primero el que vence antes).
 */

export type PageLotSource = 'TRIAL' | 'MEMBERSHIP_PERIOD' | 'PURCHASE' | 'ADJUSTMENT';

export interface PageLot {
  /** Nulo: el lote de la prueba o del periodo se crea al primer uso. */
  id: string | null;
  source: PageLotSource;
  planCode: string | null;
  productCode: string | null;
  productName: string | null;
  quantity: number;
  consumed: number;
  /** Apartado por una subida en curso. */
  held: number;
  available: number;
  startsAt: string;
  /** Nulo: no vence (la prueba gratuita). */
  expiresAt: string | null;
  pricePaidCents: number | null;
  currency: string | null;
  paymentReference: string | null;
  note: string | null;
  registeredByName: string | null;
  createdAt: string | null;
}

export interface PageBalance {
  /** Consumido del periodo en curso o de la prueba. */
  pagesUsed: number;
  /** Páginas por periodo de la membresía. Nulo: no da páginas propias o no tiene tope. */
  monthlyPageQuota: number | null;
  /** Sin tope de cobro (plan interno de administración). */
  unlimited: boolean;
  membershipExpired: boolean;
  /** Suma de lo disponible en todos los lotes vigentes. Nulo si `unlimited`. */
  pagesAvailable: number | null;
  period: { startsAt: string; endsAt: string } | null;
  lots: PageLot[];
}

const FUENTES: readonly PageLotSource[] = ['TRIAL', 'MEMBERSHIP_PERIOD', 'PURCHASE', 'ADJUSTMENT'];

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null;
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

/** `null` si la fila no es un lote: se descarta en vez de mostrar números inventados. */
export function parsePageLot(valor: unknown): PageLot | null {
  if (!esObjeto(valor)) {
    return null;
  }
  const source = valor.source;
  const quantity = numero(valor.quantity);
  const consumed = numero(valor.consumed);
  const available = numero(valor.available);
  const startsAt = texto(valor.startsAt);
  if (
    typeof source !== 'string' ||
    !FUENTES.includes(source as PageLotSource) ||
    quantity === null ||
    consumed === null ||
    available === null ||
    startsAt === null
  ) {
    return null;
  }
  return {
    id: texto(valor.id),
    source: source as PageLotSource,
    planCode: texto(valor.planCode),
    productCode: texto(valor.productCode),
    productName: texto(valor.productName),
    quantity,
    consumed,
    held: numero(valor.held) ?? 0,
    available,
    startsAt,
    expiresAt: texto(valor.expiresAt),
    pricePaidCents: numero(valor.pricePaidCents),
    currency: texto(valor.currency),
    paymentReference: texto(valor.paymentReference),
    note: texto(valor.note),
    registeredByName: texto(valor.registeredByName),
    createdAt: texto(valor.createdAt),
  };
}

export function parsePageLots(valor: unknown): PageLot[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  return valor.map(parsePageLot).filter((lote): lote is PageLot => lote !== null);
}

/**
 * `null` si no trae lo mínimo (`pagesUsed` y `monthlyPageQuota`). Lo demás se
 * completa con lo que se deduce de eso, por si responde una API anterior a los
 * lotes durante un despliegue.
 */
export function parsePageBalance(valor: unknown): PageBalance | null {
  if (!esObjeto(valor)) {
    return null;
  }
  const pagesUsed = numero(valor.pagesUsed);
  const quota = valor.monthlyPageQuota;
  if (pagesUsed === null || !(quota === null || numero(quota) !== null)) {
    return null;
  }
  const monthlyPageQuota = quota as number | null;
  const unlimited =
    typeof valor.unlimited === 'boolean' ? valor.unlimited : monthlyPageQuota === null;
  const periodo = esObjeto(valor.period) ? valor.period : null;
  const inicio = texto(periodo?.startsAt);
  const fin = texto(periodo?.endsAt);
  return {
    pagesUsed,
    monthlyPageQuota,
    unlimited,
    membershipExpired: valor.membershipExpired === true,
    pagesAvailable:
      valor.pagesAvailable === null || unlimited
        ? null
        : (numero(valor.pagesAvailable) ??
          (monthlyPageQuota === null ? null : Math.max(0, monthlyPageQuota - pagesUsed))),
    period: inicio && fin ? { startsAt: inicio, endsAt: fin } : null,
    lots: parsePageLots(valor.lots),
  };
}

/** Cómo se llama cada lote para quien lo mira. */
export function nombreDeLote(lote: Pick<PageLot, 'source' | 'productName'>): string {
  switch (lote.source) {
    case 'TRIAL':
      return 'Prueba gratuita';
    case 'MEMBERSHIP_PERIOD':
      return 'Incluidas en la membresía';
    case 'PURCHASE':
      return lote.productName ?? 'Compra';
    case 'ADJUSTMENT':
      return 'Ajuste';
  }
}

/** Páginas compradas o ajustadas que siguen disponibles: las que sobreviven al periodo. */
export function paginasCompradas(saldo: Pick<PageBalance, 'lots'>): number {
  return saldo.lots
    .filter((lote) => lote.source === 'PURCHASE' || lote.source === 'ADJUSTMENT')
    .reduce((total, lote) => total + lote.available, 0);
}

/** Fecha corta de vencimiento en la zona del navegador; «No vence» si no tiene. */
export function describirVencimiento(expiresAt: string | null): string {
  if (expiresAt === null) {
    return 'No vence';
  }
  // El lote vale hasta el instante en que empieza el día siguiente al último:
  // se muestra ese último día, que es lo que una persona entiende por «vence el».
  const ultimoDia = new Date(new Date(expiresAt).getTime() - 1);
  return ultimoDia.toLocaleDateString('es-PE', { dateStyle: 'medium' });
}

/** Fecha corta de un instante en la zona del navegador (el inicio de un periodo, por ejemplo). */
export function describirFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', { dateStyle: 'medium' });
}
