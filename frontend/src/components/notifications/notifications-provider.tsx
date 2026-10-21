import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  NotificationsContext,
  type AppNotification,
  type NotificationInput,
  type NotificationsValue,
} from './notifications-context';

/** Más avisos que estos no se leen: se descartan los más antiguos. */
const MAXIMO_A_LA_VISTA = 4;

/**
 * Avisos de la aplicación: cuando algo pasa —un documento convertido, uno
 * reemplazado, un rechazo—, se dice en pantalla, por qué y qué hacer.
 *
 * El estado vive por encima de las rutas: cambiar de página tras subir un
 * documento no borra el aviso de lo que se reemplazó para guardarlo.
 */
export function NotificationsProvider({ children }: { children: ReactNode }): ReactNode {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const contador = useRef(0);

  const notify = useCallback((input: NotificationInput): string => {
    contador.current += 1;
    const id = input.id ?? `aviso-${String(contador.current)}`;
    const version = contador.current;
    setNotifications((actuales) => {
      const nuevo: AppNotification = { ...input, id, occurredAt: new Date(), version };
      const resto = actuales.filter((aviso) => aviso.id !== id);
      return [nuevo, ...resto].slice(0, MAXIMO_A_LA_VISTA);
    });
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((actuales) => actuales.filter((aviso) => aviso.id !== id));
  }, []);

  const value = useMemo<NotificationsValue>(
    () => ({ notifications, notify, dismiss }),
    [notifications, notify, dismiss],
  );

  return <NotificationsContext value={value}>{children}</NotificationsContext>;
}
