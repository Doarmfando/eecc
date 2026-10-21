import { createContext, useCallback, useContext } from 'react';

import { ApiError, describeError, errorCode } from '@/lib/api-error';

export type NotificationVariant = 'success' | 'info' | 'warning' | 'error';

export interface NotificationInput {
  /**
   * Identidad del aviso. Uno nuevo con el mismo `id` reemplaza al anterior en vez
   * de apilarse: un reintento o un segundo clic no llenan la pantalla del mismo
   * mensaje (idempotencia también en la interfaz).
   */
  id?: string;
  variant: NotificationVariant;
  /** Qué pasó, en una línea. */
  title: string;
  /** Por qué y qué hacer. */
  description?: string;
  /** Si es un error: se muestra con tipo, código, referencia y a quién llamar. */
  error?: unknown;
  /** Milisegundos a la vista. `null`: hasta que se cierre. Por defecto, según la variante. */
  durationMs?: number | null;
}

export interface AppNotification extends NotificationInput {
  id: string;
  /** Cuándo ocurrió, para el informe a soporte. */
  occurredAt: Date;
  /** Cambia al reemplazarlo, para reiniciar su temporizador. */
  version: number;
}

export interface NotificationsValue {
  notifications: readonly AppNotification[];
  notify: (input: NotificationInput) => string;
  dismiss: (id: string) => void;
}

export const NotificationsContext = createContext<NotificationsValue | null>(null);

/** Sin proveedor (una prueba aislada) avisar no hace nada en vez de romper. */
const SIN_AVISOS: NotificationsValue = {
  notifications: [],
  notify: () => '',
  dismiss: () => undefined,
};

export function useNotifications(): NotificationsValue {
  return useContext(NotificationsContext) ?? SIN_AVISOS;
}

/**
 * Aviso de error con el porqué y los datos para soporte. El `id` sale del código y
 * la referencia: el mismo fallo, avisado dos veces, se ve una sola.
 */
export function useNotifyError(): (error: unknown, title: string) => void {
  const { notify } = useNotifications();
  return useCallback(
    (error: unknown, title: string) => {
      const referencia = error instanceof ApiError ? (error.requestId ?? '') : '';
      notify({
        id: `error:${title}:${errorCode(error)}:${referencia}`,
        variant: 'error',
        title,
        description: describeError(error),
        error,
      });
    },
    [notify],
  );
}
