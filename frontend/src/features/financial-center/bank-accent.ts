import bbvaLogo from '@/assets/banks/bbva.png';
import bcpLogo from '@/assets/banks/bcp.png';
import interbankLogo from '@/assets/banks/interbank.webp';
import nacionLogo from '@/assets/banks/nacion-simbolo.png';
import scotiabankLogo from '@/assets/banks/scotiabank.webp';

import { BANK_NAMES, type BankId } from '@/features/statements/bank-selector';

/**
 * Banco de origen de un estado de cuenta ya procesado.
 *
 * Es más ancho que {@link BankId}, el del selector de carga: el worker detecta la
 * plantilla por su cuenta, así que también llegan documentos que resolvió el
 * respaldo genérico (`otro`). Sin él, un estado de cuenta real no se podría ni
 * mostrar.
 */
export type SourceBankId = BankId | 'otro';

interface BankAccent {
  name: string;
  /**
   * `null` cuando no hay logotipo propio: la marca se dibuja con un ícono. Se
   * muestra en huecos de unos 36 × 24 px, así que un logotipo muy apaisado (el
   * del Banco de la Nación, casi 5:1, con su nombre) se queda en unos píxeles de
   * alto: para esos se usa solo el símbolo.
   */
  logo: string | null;
  barClassName: string;
  dotClassName: string;
}

/** Un acento por banco para distinguirlos de un vistazo en barras y leyendas. */
export const BANK_ACCENTS: Record<SourceBankId, BankAccent> = {
  bcp: {
    name: BANK_NAMES.bcp,
    logo: bcpLogo,
    barClassName: 'bg-orange-500',
    dotClassName: 'bg-orange-500',
  },
  bbva: {
    name: BANK_NAMES.bbva,
    logo: bbvaLogo,
    barClassName: 'bg-sky-500',
    dotClassName: 'bg-sky-500',
  },
  interbank: {
    name: BANK_NAMES.interbank,
    logo: interbankLogo,
    barClassName: 'bg-emerald-500',
    dotClassName: 'bg-emerald-500',
  },
  scotiabank: {
    name: BANK_NAMES.scotiabank,
    logo: scotiabankLogo,
    barClassName: 'bg-rose-500',
    dotClassName: 'bg-rose-500',
  },
  nacion: {
    name: BANK_NAMES.nacion,
    logo: nacionLogo,
    barClassName: 'bg-violet-500',
    dotClassName: 'bg-violet-500',
  },
  otro: {
    name: 'Otro banco',
    logo: null,
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
  'bbva-account-v1': 'bbva',
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
