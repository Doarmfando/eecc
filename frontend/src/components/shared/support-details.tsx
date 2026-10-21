import { Check, Copy, Phone } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { useSupportPhone } from '@/features/access/queries';
import { ApiError, describeErrorKind, errorCode } from '@/lib/api-error';
import { formatearHora, textoParaSoporte } from '@/lib/support-report';

/**
 * Lo que soporte necesita para encontrar un fallo: tipo, código, referencia de la
 * petición y hora, más a quién llamar. Ninguno revela el documento: la referencia
 * es un identificador opaco que solo se cruza con el registro del servidor.
 */
export function SupportDetails({
  error,
  ocurrio,
}: {
  error: unknown;
  /** Cuándo pasó. Sin valor, el momento en que se mostró por primera vez. */
  ocurrio?: Date;
}): ReactNode {
  const telefono = useSupportPhone();
  const [primeraVez] = useState(() => new Date());
  const [copiado, setCopiado] = useState(false);
  const momento = ocurrio ?? primeraVez;
  const referencia = error instanceof ApiError ? error.requestId : undefined;

  async function copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(textoParaSoporte(error, momento));
      setCopiado(true);
    } catch {
      // Sin portapapeles los datos siguen a la vista para dictarlos.
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border/60 bg-background/70 p-2.5 text-xs text-muted-foreground">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt>Tipo</dt>
        <dd className="text-foreground">{describeErrorKind(error)}</dd>
        <dt>Código</dt>
        <dd className="font-mono break-all text-foreground">{errorCode(error)}</dd>
        {referencia ? (
          <>
            <dt>Referencia</dt>
            <dd className="font-mono break-all text-foreground">{referencia}</dd>
          </>
        ) : null}
        <dt>Hora</dt>
        <dd className="text-foreground">{formatearHora(momento)}</dd>
      </dl>
      <p>
        {telefono ? (
          <>
            ¿Se repite? Llama a soporte al{' '}
            <a
              href={`tel:${telefono.replace(/[^+\d]/g, '')}`}
              className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2"
            >
              <Phone aria-hidden className="size-3" />
              {telefono}
            </a>{' '}
            y dicta el código y la referencia.
          </>
        ) : (
          'Si se repite, avisa a un administrador con el código y la referencia.'
        )}
      </p>
      <button
        type="button"
        onClick={() => {
          void copiar();
        }}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 font-medium text-foreground hover:bg-accent"
      >
        {copiado ? (
          <Check aria-hidden className="size-3.5" />
        ) : (
          <Copy aria-hidden className="size-3.5" />
        )}
        {copiado ? 'Datos copiados' : 'Copiar datos para soporte'}
      </button>
    </div>
  );
}
