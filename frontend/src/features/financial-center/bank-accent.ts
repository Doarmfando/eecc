import bbvaLogo from '@/assets/banks/bbva.png';
import bcpLogo from '@/assets/banks/bcp.png';
import interbankLogo from '@/assets/banks/interbank.webp';
import scotiabankLogo from '@/assets/banks/scotiabank.webp';
import { BANK_NAMES, type BankId } from '@/features/statements/bank-selector';

interface BankAccent {
  name: string;
  logo: string;
  badgeClassName: string;
  barClassName: string;
  dotClassName: string;
}

/** Un acento por banco para distinguirlos de un vistazo en badges, barras y leyendas. */
export const BANK_ACCENTS: Record<BankId, BankAccent> = {
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
};
