import { AlertTriangle, CheckCircle2, CircleAlert, Info, X, type LucideIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

import { SupportDetails } from '@/components/shared/support-details';
import { cn } from '@/lib/utils';

import {
  useNotifications,
  type AppNotification,
  type NotificationVariant,
} from './notifications-context';

/** Los errores se quedan hasta que se cierran: hay que poder leer el código a soporte. */
const DURACION: Record<NotificationVariant, number | null> = {
  success: 6000,
  info: 8000,
  warning: 12000,
  error: null,
};

const ICONO: Record<NotificationVariant, LucideIcon> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: CircleAlert,
};

const ETIQUETA: Record<NotificationVariant, string> = {
  success: 'Hecho',
  info: 'Información',
  warning: 'Atención',
  error: 'Error',
};

const ESTILO: Record<NotificationVariant, string> = {
  success: 'border-l-success',
  info: 'border-l-primary/60',
  warning: 'border-l-warning',
  error: 'border-l-destructive',
};

const COLOR_ICONO: Record<NotificationVariant, string> = {
  success: 'text-success',
  info: 'text-primary',
  warning: 'text-warning-foreground',
  error: 'text-destructive',
};

function Aviso({
  aviso,
  onClose,
}: {
  aviso: AppNotification;
  onClose: (id: string) => void;
}): ReactNode {
  const duracion = aviso.durationMs === undefined ? DURACION[aviso.variant] : aviso.durationMs;
  const Icono = ICONO[aviso.variant];

  useEffect(() => {
    if (duracion === null) {
      return undefined;
    }
    const temporizador = setTimeout(() => {
      onClose(aviso.id);
    }, duracion);
    return () => {
      clearTimeout(temporizador);
    };
    // `version` reinicia el plazo cuando un aviso igual reemplaza a este.
  }, [aviso.id, aviso.version, duracion, onClose]);

  return (
    <div
      role={aviso.variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto grid grid-cols-[auto_1fr_auto] items-start gap-x-3 rounded-lg border border-l-4 border-border bg-card px-4 py-3 text-sm shadow-lg',
        ESTILO[aviso.variant],
      )}
    >
      <Icono aria-hidden className={cn('mt-0.5 size-4', COLOR_ICONO[aviso.variant])} />
      <div className="min-w-0">
        <p className="font-medium break-words text-foreground [overflow-wrap:anywhere]">
          <span className="sr-only">{ETIQUETA[aviso.variant]}: </span>
          {aviso.title}
        </p>
        {aviso.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{aviso.description}</p>
        ) : null}
        {aviso.variant === 'error' ? (
          <SupportDetails error={aviso.error} ocurrio={aviso.occurredAt} />
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={() => {
          onClose(aviso.id);
        }}
        className="-mt-1 -mr-2 flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

/**
 * Pila de avisos arriba a la derecha (abajo del todo en móvil sería tapar el
 * botón de enviar). El más reciente va primero.
 */
export function NotificationRegion(): ReactNode {
  const { notifications, dismiss } = useNotifications();

  return (
    <section
      aria-label="Avisos"
      className="pointer-events-none fixed top-[4.5rem] right-4 left-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-[26rem]"
    >
      {notifications.map((aviso) => (
        <Aviso key={aviso.id} aviso={aviso} onClose={dismiss} />
      ))}
    </section>
  );
}
