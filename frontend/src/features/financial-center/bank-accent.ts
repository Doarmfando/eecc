import bbvaLogo from '@/assets/banks/bbva.png';
import bcpLogo from '@/assets/banks/bcp.png';
import interbankLogo from '@/assets/banks/interbank.webp';
import scotiabankLogo from '@/assets/banks/scotiabank.webp';
import { BANK_NAMES, type BankId } from '@/features/statements/bank-selector';

/**
 * Banco de origen de un estado de cuenta ya procesado.
 *
 * Es más ancho que {@link BankId}, el del selector de carga: el worker detecta la
 * plantilla por su cuenta, así que llegan documentos de bancos que el selector
 * todavía no ofrece (`nacion`) y documentos que resolvió el respaldo genérico
 * (`otro`). Sin estos dos, un estado de cuenta real no se podría ni mostrar.
 */
export type SourceBankId = BankId | 'nacion' | 'otro';

interface BankAccent {
  name: string;
  /** `null` cuando no hay logotipo propio: la marca se dibuja con un ícono. */
  logo: string | null;
  badgeClassName: string;
  barClassName: string;
  dotClassName: string;
}

/** Un acento por banco para distinguirlos de un vistazo en badges, barras y leyendas. */
export const BANK_ACCENTS: Record<SourceBankId, BankAccent> = {
  bcp: {
    name: BANK_NAMES.bcp,
    logo: bcpLogo,
    badgeClassName: 'bg-orange-100 text-orange-700',
    barClassName: 'bg-orange-500',
    dotClassName: 'bg-orange-500',
  },
  bbva: {
    name: BANK_NAMES.bbva,
    logo: bbvaLogo,
    badgeClassName: 'bg-sky-100 text-sky-700',
    barClassName: 'bg-sky-500',
    dotClassName: 'bg-sky-500',
  },
  interbank: {
    name: BANK_NAMES.interbank,
    logo: interbankLogo,
    badgeClassName: 'bg-emerald-100 text-emerald-700',
    barClassName: 'bg-emerald-500',
    dotClassName: 'bg-emerald-500',
  },
  scotiabank: {
    name: BANK_NAMES.scotiabank,
    logo: scotiabankLogo,
    badgeClassName: 'bg-rose-100 text-rose-700',
    barClassName: 'bg-rose-500',
    dotClassName: 'bg-rose-500',
  },
  nacion: {
    name: 'Banco de la Nación',
    logo: null,
    badgeClassName: 'bg-violet-100 text-violet-700',
    barClassName: 'bg-violet-500',
    dotClassName: 'bg-violet-500',
  },
  otro: {
    name: 'Otro banco',
    logo: null,
    badgeClassName: 'bg-slate-100 text-slate-600',
    barClassName: 'bg-slate-400',
    dotClassName: 'bg-slate-400',
  },
};

/**
 * Identificadores de extractor del worker. No se derivan del texto del
 * identificador: un nombre nuevo debe entrar aquí a propósito, no colarse por
 * parecido, y lo que no está en la tabla cae en `otro` en vez de desaparecer.
 */
const BANK_BY_EXTRACTOR: Record<string, SourceBankId> = {
  'bcp-coordinate-v1': 'bcp',
  'interbank-savings-v1': 'interbank',
  'banco-nacion-v1': 'nacion',
  'generic-table-v1': 'otro',
};

export function bankFromExtractor(extractorId: string): SourceBankId {
  return BANK_BY_EXTRACTOR[extractorId] ?? 'otro';
}

/**
 * Orden de presentación de los bancos. No es un catálogo: los que se muestran
 * salen de los estados de cuenta cargados, porque un banco sin documentos no
 * tiene saldo que enseñar y una fila en cero se leería como «cuenta vacía».
 */
const BANK_ORDER: readonly SourceBankId[] = [
  'bcp',
  'bbva',
  'interbank',
  'scotiabank',
  'nacion',
  'otro',
];

export function orderBanks(bankIds: Iterable<SourceBankId>): SourceBankId[] {
  const present = new Set(bankIds);
  return BANK_ORDER.filter((bankId) => present.has(bankId));
}
