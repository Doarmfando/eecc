import { Landmark } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { BANK_ACCENTS, type SourceBankId } from './bank-accent';

/**
 * El logotipo del banco, o un ícono neutro cuando no tenemos uno.
 *
 * No se inventa una marca ajena: los bancos sin logotipo propio en el proyecto
 * (Banco de la Nación, o lo que resolvió el respaldo genérico) se dibujan con el
 * mismo ícono y su nombre, que es lo que hace falta para distinguirlos.
 */
export function BankMark({
  bankId,
  className,
  labelled = false,
}: {
  bankId: SourceBankId;
  className?: string;
  /** `true` expone el nombre del banco a lectores de pantalla; `false` lo oculta. */
  labelled?: boolean;
}): ReactNode {
  const accent = BANK_ACCENTS[bankId];
  if (accent.logo) {
    return (
      <img
        src={accent.logo}
        alt={labelled ? accent.name : ''}
        aria-hidden={labelled ? undefined : true}
        title={accent.name}
        className={cn('object-contain', className)}
      />
    );
  }
  return (
    <Landmark
      aria-label={labelled ? accent.name : undefined}
      aria-hidden={labelled ? undefined : true}
      // `size-*` en la clase del sitio de uso gana a las medidas del ícono.
      className={cn('shrink-0 text-current', className)}
    />
  );
}
