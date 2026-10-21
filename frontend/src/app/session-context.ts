import { createContext } from 'react';

import type { FeatureCode } from '@/features/access/access';
import type { SessionUser } from '@/lib/session-client';

export type SessionState = 'cargando' | 'autenticado' | 'anonimo';

export interface SessionValue {
  baseUrl: string;
  estado: SessionState;
  usuario: SessionUser | null;
  /** Guarda la sesión recién iniciada sin volver a pedirla al servidor. */
  establecer: (usuario: SessionUser) => void;
  /** Cierra la sesión; `aviso` se muestra después en la pantalla de entrada. */
  cerrar: (aviso?: string) => Promise<void>;
  /** Motivo del último cierre de sesión, si lo hubo. Se borra al volver a entrar. */
  aviso: string | null;
  /** Si su rol tiene `USERS_MANAGE`: quien gestiona las cuentas de la organización. */
  puedeAdministrar: boolean;
  /** Si su membresía incluye esa vista (Historial, Centro Financiero, Calendario…). */
  tieneFuncion: (funcion: FeatureCode) => boolean;
}

export const SessionContext = createContext<SessionValue | null>(null);
