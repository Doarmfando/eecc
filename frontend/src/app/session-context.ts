import { createContext } from 'react';

import type { SessionUser } from '@/lib/session-client';

export type SessionState = 'cargando' | 'autenticado' | 'anonimo';

export interface SessionValue {
  baseUrl: string;
  estado: SessionState;
  usuario: SessionUser | null;
  /** Guarda la sesión recién iniciada sin volver a pedirla al servidor. */
  establecer: (usuario: SessionUser) => void;
  cerrar: () => Promise<void>;
  /** `true` para OWNER y ADMIN: son quienes pueden gestionar personas. */
  puedeAdministrar: boolean;
}

export const SessionContext = createContext<SessionValue | null>(null);
